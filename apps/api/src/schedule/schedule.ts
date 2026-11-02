import { CalendarSyncService } from '../integrations/integrations';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Injectable,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AppointmentInputSchema,
  AttendanceSchema,
  AvailabilityInputSchema,
  BookSlotSchema,
  RangeQuerySchema,
  ScheduleBlockInputSchema,
  ScheduleSettingsSchema,
  type AppointmentInput,
} from '@vetta/contracts';
import {
  expandWeekly,
  freeSlots,
  InvalidRecurrenceError,
  parseRRule,
  withinPolicy,
  zonedParts,
  type EventPublisher,
} from '@vetta/server';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Can, RequireFeature } from '../access/decorators';
import { AppException, badRequest, conflict, forbidden, notFound } from '../common/errors';
import { CurrentTenant, type TenantAccess } from '../common/request';
import { assertStudentInScope, requireStudent } from '../common/scope';
import { EVENTS } from '../infra/infra.module';
import { PrismaService } from '../infra/prisma.service';

class AvailabilityDto extends createZodDto(AvailabilityInputSchema) {}
class BlockDto extends createZodDto(ScheduleBlockInputSchema) {}
class AppointmentDto extends createZodDto(AppointmentInputSchema) {}
class AttendanceDto extends createZodDto(AttendanceSchema) {}
class BookDto extends createZodDto(BookSlotSchema) {}
class RangeDto extends createZodDto(RangeQuerySchema) {}
class AttendeeDto extends createZodDto(z.object({ studentLinkId: z.uuid() })) {}
class SettingsDto extends createZodDto(ScheduleSettingsSchema) {}
class CancelDto extends createZodDto(
  z.object({
    scope: z.enum(['one', 'following']).default('one'),
    reason: z.string().max(200).optional(),
  }),
) {}

const HORIZON_WEEKS = 26;
const DAY = 86_400_000;
const slotUnavailable = (msg: string) =>
  new AppException('SLOT_UNAVAILABLE', msg, HttpStatus.CONFLICT);

@Injectable()
export class ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EVENTS) private readonly events: EventPublisher,
    private readonly calendar: CalendarSyncService,
  ) {}

  private async tenantInfo(tenantId: string) {
    return this.prisma.tenant(tenantId).tenant.findFirstOrThrow({
      where: { id: tenantId },
      select: {
        timezone: true,
        ownerUserId: true,
        bookingMinHours: true,
        cancelMinHours: true,
        name: true,
      },
    });
  }

  /** Agenda do personal dono (alunos agendam com ele). */
  private async ownerMemberId(tenantId: string) {
    const m = await this.prisma
      .tenant(tenantId)
      .tenantMember.findFirstOrThrow({ where: { role: 'OWNER' } });
    return m.id;
  }

  private memberOf(t: TenantAccess) {
    if (!t.memberId) throw forbidden();
    return t.memberId;
  }

  // ─── Disponibilidade e bloqueios ───────────────────────────────────────────

  availability(t: TenantAccess) {
    return this.prisma.tenant(t.tenantId).availabilityRule.findMany({
      where: { memberId: this.memberOf(t), deletedAt: null },
      orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
    });
  }

  async setAvailability(t: TenantAccess, dto: z.infer<typeof AvailabilityInputSchema>) {
    const memberId = this.memberOf(t);
    const db = this.prisma.tenant(t.tenantId);
    const sorted = [...dto.rules].sort(
      (a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute,
    );
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1]!;
      const b = sorted[i]!;
      if (a.weekday === b.weekday && b.startMinute < a.endMinute)
        throw badRequest('Há janelas sobrepostas no mesmo dia.');
    }
    await db.availabilityRule.updateMany({
      where: { memberId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (dto.rules.length)
      await db.availabilityRule.createMany({
        data: dto.rules.map((r) => ({ ...r, memberId, tenantId: t.tenantId })) as never,
      });
    return this.availability(t);
  }

  blocks(t: TenantAccess, q: { from: string; to: string }) {
    return this.prisma.tenant(t.tenantId).scheduleBlock.findMany({
      where: {
        memberId: this.memberOf(t),
        deletedAt: null,
        startsAt: { lt: new Date(q.to) },
        endsAt: { gt: new Date(q.from) },
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  addBlock(t: TenantAccess, dto: z.infer<typeof ScheduleBlockInputSchema>) {
    return this.prisma.tenant(t.tenantId).scheduleBlock.create({
      data: {
        memberId: this.memberOf(t),
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        reason: dto.reason ?? null,
      } as never,
    });
  }

  async deleteBlock(t: TenantAccess, id: string) {
    const db = this.prisma.tenant(t.tenantId);
    const b = await db.scheduleBlock.findFirst({ where: { id, deletedAt: null } });
    if (!b) throw notFound('Bloqueio não encontrado.');
    await db.scheduleBlock.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true as const };
  }

  async settings(tenantId: string, dto?: { bookingMinHours: number; cancelMinHours: number }) {
    const db = this.prisma.tenant(tenantId);
    if (dto) await db.tenant.update({ where: { id: tenantId }, data: dto });
    return db.tenant.findFirstOrThrow({
      where: { id: tenantId },
      select: { bookingMinHours: true, cancelMinHours: true },
    });
  }

  // ─── Aulas ─────────────────────────────────────────────────────────────────

  private include = {
    attendees: {
      where: { deletedAt: null },
      include: { studentLink: { select: { id: true, displayName: true, userId: true } } },
    },
  } as const;

  async list(t: TenantAccess, q: { from: string; to: string }) {
    const db = this.prisma.tenant(t.tenantId);
    const range = {
      startsAt: { lt: new Date(q.to) },
      endsAt: { gt: new Date(q.from) },
      deletedAt: null,
    };
    if (t.role === 'ALUNO') {
      const linkId = requireStudent(t);
      return db.appointment.findMany({
        where: { ...range, attendees: { some: { studentLinkId: linkId, deletedAt: null } } },
        include: { attendees: { where: { studentLinkId: linkId } } },
        orderBy: { startsAt: 'asc' },
      });
    }
    return db.appointment.findMany({
      where: {
        ...range,
        ...(t.role === 'PERSONAL_ASSISTENTE' ? { memberId: t.memberId! } : {}),
      },
      include: this.include,
      orderBy: { startsAt: 'asc' },
    });
  }

  async get(t: TenantAccess, id: string) {
    const a = await this.prisma
      .tenant(t.tenantId)
      .appointment.findFirst({ where: { id, deletedAt: null }, include: this.include });
    if (!a) throw notFound('Aula não encontrada.');
    if (t.role === 'ALUNO' && !a.attendees.some((x) => x.studentLinkId === t.studentLinkId))
      throw notFound('Aula não encontrada.');
    if (t.role === 'ALUNO')
      return { ...a, attendees: a.attendees.filter((x) => x.studentLinkId === t.studentLinkId) };
    return a;
  }

  private async busy(tenantId: string, memberId: string, from: Date, to: Date, exceptId?: string) {
    const db = this.prisma.tenant(tenantId);
    const [appts, blocks] = await Promise.all([
      db.appointment.findMany({
        where: {
          memberId,
          deletedAt: null,
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
          startsAt: { lt: to },
          endsAt: { gt: from },
          ...(exceptId ? { id: { not: exceptId } } : {}),
        },
        select: { startsAt: true, endsAt: true },
      }),
      db.scheduleBlock.findMany({
        where: { memberId, deletedAt: null, startsAt: { lt: to }, endsAt: { gt: from } },
        select: { startsAt: true, endsAt: true },
      }),
    ]);
    return [...appts, ...blocks];
  }

  /** Cria a aula (e as ocorrências da recorrência, até 26 semanas). */
  async create(t: TenantAccess, dto: AppointmentInput) {
    const memberId = this.memberOf(t);
    const db = this.prisma.tenant(t.tenantId);
    for (const id of dto.studentLinkIds) await assertStudentInScope(this.prisma, t, id);
    const tenant = await this.tenantInfo(t.tenantId);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    const duration = endsAt.getTime() - startsAt.getTime();

    let starts = [startsAt];
    if (dto.recurrenceRule) {
      let rule;
      try {
        rule = parseRRule(dto.recurrenceRule);
      } catch (err) {
        if (err instanceof InvalidRecurrenceError) throw badRequest(err.message);
        throw err;
      }
      const local = zonedParts(startsAt, tenant.timezone);
      const horizon = new Date(startsAt.getTime() + HORIZON_WEEKS * 7 * DAY)
        .toISOString()
        .slice(0, 10);
      const dates = expandWeekly(local.date, rule, { horizon, maxOccurrences: 200 });
      const offsetMs = startsAt.getTime() - Date.parse(`${local.date}T00:00:00Z`);
      starts = dates.map((d) => new Date(Date.parse(`${d}T00:00:00Z`) + offsetMs));
      if (!starts.length) throw badRequest('A recorrência não gera nenhuma aula.');
    }
    // Conflitos com outras aulas e bloqueios do personal.
    for (const s of starts) {
      const e = new Date(s.getTime() + duration);
      const clash = (await this.busy(t.tenantId, memberId, s, e)).length;
      if (clash)
        throw slotUnavailable(
          `Já existe compromisso em ${s.toLocaleString('pt-BR', { timeZone: tenant.timezone })}.`,
        );
    }
    const base = {
      memberId,
      title: dto.title,
      type: dto.type,
      location: dto.location ?? null,
      meetingUrl: dto.meetingUrl ?? null,
      capacity: dto.capacity,
      notes: dto.notes ?? null,
      recurrenceRule: dto.recurrenceRule ?? null,
    };
    const parent = await db.appointment.create({
      data: {
        ...base,
        startsAt: starts[0]!,
        endsAt: new Date(starts[0]!.getTime() + duration),
      } as never,
    });
    const ids = [parent.id];
    for (const s of starts.slice(1)) {
      const occ = await db.appointment.create({
        data: {
          ...base,
          startsAt: s,
          endsAt: new Date(s.getTime() + duration),
          recurrenceParentId: parent.id,
        } as never,
      });
      ids.push(occ.id);
    }
    if (dto.studentLinkIds.length) {
      await db.appointmentAttendee.createMany({
        data: ids.flatMap((appointmentId) =>
          dto.studentLinkIds.map((studentLinkId) => ({
            tenantId: t.tenantId,
            appointmentId,
            studentLinkId,
            status: 'BOOKED' as const,
          })),
        ) as never,
      });
      await this.notifyBooked(
        t.tenantId,
        parent.id,
        dto.studentLinkIds,
        tenant.timezone,
        ids.length,
      );
    }
    this.calendar.queuePush(ids);
    return { ...(await this.get(t, parent.id)), occurrences: ids.length };
  }

  private async notifyBooked(
    tenantId: string,
    appointmentId: string,
    studentLinkIds: string[],
    tz: string,
    count = 1,
  ) {
    const db = this.prisma.tenant(tenantId);
    const a = await db.appointment.findFirstOrThrow({ where: { id: appointmentId } });
    const users = await db.studentLink.findMany({
      where: { id: { in: studentLinkIds }, userId: { not: null } },
      select: { userId: true },
    });
    if (!users.length) return;
    await this.events.publish('appointment.booked', {
      tenantId,
      payload: {
        userIds: users.map((u) => u.userId!),
        appointmentId,
        title: a.title,
        when: a.startsAt.toLocaleString('pt-BR', {
          timeZone: tz,
          dateStyle: 'short',
          timeStyle: 'short',
        }),
        recurring: count > 1 ? ` (${count} aulas)` : '',
      },
    });
  }

  async update(t: TenantAccess, id: string, dto: AppointmentInput) {
    const db = this.prisma.tenant(t.tenantId);
    const a = await this.get(t, id);
    const s = new Date(dto.startsAt);
    const e = new Date(dto.endsAt);
    if ((await this.busy(t.tenantId, a.memberId, s, e, id)).length)
      throw slotUnavailable('Horário ocupado.');
    const booked = (a as { attendees: { status: string }[] }).attendees.filter((x) =>
      ['BOOKED', 'CONFIRMED', 'ATTENDED'].includes(x.status),
    ).length;
    if (dto.capacity < booked) throw badRequest(`Já há ${booked} alunos nesta aula.`);
    await db.appointment.update({
      where: { id },
      data: {
        title: dto.title,
        type: dto.type,
        startsAt: s,
        endsAt: e,
        location: dto.location ?? null,
        meetingUrl: dto.meetingUrl ?? null,
        capacity: dto.capacity,
        notes: dto.notes ?? null,
        reminderSentAt: null,
        reminder1hSentAt: null,
      },
    });
    this.calendar.queuePush([id]);
    return this.get(t, id);
  }

  /** Personal cancela a aula (só esta ou esta e as seguintes da série). */
  async cancel(t: TenantAccess, id: string, scope: 'one' | 'following') {
    const db = this.prisma.tenant(t.tenantId);
    const a = await this.get(t, id);
    const seriesId = a.recurrenceParentId ?? (a.recurrenceRule ? a.id : null);
    const where =
      scope === 'following' && seriesId
        ? {
            OR: [{ id: seriesId }, { recurrenceParentId: seriesId }],
            startsAt: { gte: a.startsAt },
            deletedAt: null,
          }
        : { id };
    const affected = await db.appointment.findMany({ where, include: this.include });
    await db.appointment.updateMany({ where, data: { status: 'CANCELED' } });
    this.calendar.queuePush(affected.map((x) => x.id));
    const userIds = [
      ...new Set(
        affected
          .flatMap((x) =>
            x.attendees.filter((y) => y.status !== 'CANCELED').map((y) => y.studentLink.userId),
          )
          .filter((u): u is string => !!u),
      ),
    ];
    if (userIds.length)
      await this.events.publish('appointment.canceled', {
        tenantId: t.tenantId,
        payload: { userIds, appointmentId: id, title: a.title, count: affected.length },
      });
    return { canceled: affected.length };
  }

  async attendance(t: TenantAccess, id: string, dto: z.infer<typeof AttendanceSchema>) {
    const db = this.prisma.tenant(t.tenantId);
    await this.get(t, id);
    for (const item of dto.items) {
      await db.appointmentAttendee.updateMany({
        where: { appointmentId: id, studentLinkId: item.studentLinkId },
        data: { status: item.status },
      });
    }
    const left = await db.appointmentAttendee.count({
      where: { appointmentId: id, status: { in: ['BOOKED', 'CONFIRMED'] } },
    });
    if (!left) await db.appointment.update({ where: { id }, data: { status: 'DONE' } });
    return this.get(t, id);
  }

  async addAttendee(t: TenantAccess, id: string, studentLinkId: string) {
    const db = this.prisma.tenant(t.tenantId);
    await assertStudentInScope(this.prisma, t, studentLinkId);
    const a = await this.get(t, id);
    const taken = (
      a as { attendees: { status: string; studentLinkId: string }[] }
    ).attendees.filter((x) => x.status !== 'CANCELED');
    if (taken.some((x) => x.studentLinkId === studentLinkId))
      throw conflict('Aluno já está na aula.');
    if (taken.length >= a.capacity) throw slotUnavailable('Turma lotada.');
    await db.appointmentAttendee.upsert({
      where: { appointmentId_studentLinkId: { appointmentId: id, studentLinkId } },
      create: { tenantId: t.tenantId, appointmentId: id, studentLinkId } as never,
      update: { status: 'BOOKED', canceledAt: null, deletedAt: null },
    });
    const tenant = await this.tenantInfo(t.tenantId);
    await this.notifyBooked(t.tenantId, id, [studentLinkId], tenant.timezone);
    return this.get(t, id);
  }

  // ─── Aluno ─────────────────────────────────────────────────────────────────

  /** Horários livres do personal + turmas com vaga. */
  async slots(t: TenantAccess, q: { from: string; to: string }) {
    const tenant = await this.tenantInfo(t.tenantId);
    const memberId = await this.ownerMemberId(t.tenantId);
    const db = this.prisma.tenant(t.tenantId);
    const from = new Date(q.from);
    const to = new Date(Math.min(new Date(q.to).getTime(), from.getTime() + 31 * DAY));
    const [windows, busy, classes] = await Promise.all([
      db.availabilityRule.findMany({ where: { memberId, deletedAt: null } }),
      this.busy(t.tenantId, memberId, from, to),
      db.appointment.findMany({
        where: {
          memberId,
          deletedAt: null,
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
          capacity: { gt: 1 },
          startsAt: { gte: from, lt: to },
        },
        include: {
          attendees: { where: { status: { in: ['BOOKED', 'CONFIRMED'] }, deletedAt: null } },
        },
        orderBy: { startsAt: 'asc' },
      }),
    ]);
    const notBefore = new Date(Date.now() + tenant.bookingMinHours * 3_600_000);
    const free = freeSlots({
      windows,
      busy,
      from: zonedParts(from, tenant.timezone).date,
      to: zonedParts(to, tenant.timezone).date,
      timeZone: tenant.timezone,
      notBefore,
    }).filter((s) => s.startsAt >= from && s.startsAt < to);
    const windowFor = (s: Date) => {
      const p = zonedParts(s, tenant.timezone);
      return windows.find(
        (w) => w.weekday === p.weekday && p.minutes >= w.startMinute && p.minutes < w.endMinute,
      );
    };
    return {
      timezone: tenant.timezone,
      slots: free.map((s) => {
        const w = windowFor(s.startsAt);
        return {
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          type: w?.type ?? 'IN_PERSON',
          location: w?.location ?? null,
        };
      }),
      classes: classes
        .filter(
          (c) =>
            c.startsAt >= notBefore &&
            c.attendees.length < c.capacity &&
            !c.attendees.some((x) => x.studentLinkId === t.studentLinkId),
        )
        .map((c) => ({
          appointmentId: c.id,
          title: c.title,
          startsAt: c.startsAt,
          endsAt: c.endsAt,
          type: c.type,
          spotsLeft: c.capacity - c.attendees.length,
        })),
    };
  }

  async book(t: TenantAccess, dto: z.infer<typeof BookSlotSchema>) {
    const linkId = requireStudent(t);
    const tenant = await this.tenantInfo(t.tenantId);
    const db = this.prisma.tenant(t.tenantId);
    if (dto.appointmentId) {
      const a = await db.appointment.findFirst({
        where: {
          id: dto.appointmentId,
          deletedAt: null,
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
        },
        include: { attendees: { where: { status: { in: ['BOOKED', 'CONFIRMED'] } } } },
      });
      if (!a) throw notFound('Aula não encontrada.');
      if (!withinPolicy(a.startsAt, new Date(), tenant.bookingMinHours))
        throw slotUnavailable(`Agende com pelo menos ${tenant.bookingMinHours} h de antecedência.`);
      if (a.attendees.length >= a.capacity) throw slotUnavailable('Turma lotada.');
      if (a.attendees.some((x) => x.studentLinkId === linkId))
        throw conflict('Você já está nesta aula.');
      await db.appointmentAttendee.upsert({
        where: { appointmentId_studentLinkId: { appointmentId: a.id, studentLinkId: linkId } },
        create: { tenantId: t.tenantId, appointmentId: a.id, studentLinkId: linkId } as never,
        update: { status: 'BOOKED', canceledAt: null, deletedAt: null },
      });
      await this.notifyStaff(t.tenantId, a.id, linkId, 'agendou');
      this.calendar.queuePush([a.id]);
      return this.get(t, a.id);
    }
    const startsAt = new Date(dto.startsAt);
    const { slots } = await this.slots(t, {
      from: new Date(startsAt.getTime() - 1).toISOString(),
      to: new Date(startsAt.getTime() + DAY).toISOString(),
    });
    const slot = slots.find((s) => s.startsAt.getTime() === startsAt.getTime());
    if (!slot) throw slotUnavailable('Este horário não está mais disponível.');
    const memberId = await this.ownerMemberId(t.tenantId);
    const link = await db.studentLink.findFirstOrThrow({ where: { id: linkId } });
    const rule = (
      await db.availabilityRule.findMany({ where: { memberId, deletedAt: null } })
    ).find((w) => {
      const p = zonedParts(startsAt, tenant.timezone);
      return w.weekday === p.weekday && p.minutes >= w.startMinute && p.minutes < w.endMinute;
    });
    const a = await db.appointment.create({
      data: {
        memberId,
        title: `Aula – ${link.displayName}`,
        type: rule?.type ?? 'IN_PERSON',
        location: rule?.location ?? null,
        meetingUrl: rule?.meetingUrl ?? null,
        capacity: 1,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      } as never,
    });
    await db.appointmentAttendee.create({
      data: { appointmentId: a.id, studentLinkId: linkId } as never,
    });
    await this.notifyStaff(t.tenantId, a.id, linkId, 'agendou');
    return this.get(t, a.id);
  }

  private async notifyStaff(
    tenantId: string,
    appointmentId: string,
    studentLinkId: string,
    verb: string,
  ) {
    const db = this.prisma.tenant(tenantId);
    const [a, link, tenant] = await Promise.all([
      db.appointment.findFirstOrThrow({
        where: { id: appointmentId },
        include: { member: { select: { userId: true } } },
      }),
      db.studentLink.findFirstOrThrow({ where: { id: studentLinkId } }),
      this.tenantInfo(tenantId),
    ]);
    await this.events.publish(verb === 'cancelou' ? 'appointment.canceled' : 'appointment.booked', {
      tenantId,
      payload: {
        userIds: [a.member.userId],
        appointmentId,
        title: `${link.displayName} ${verb}: ${a.title}`,
        when: a.startsAt.toLocaleString('pt-BR', {
          timeZone: tenant.timezone,
          dateStyle: 'short',
          timeStyle: 'short',
        }),
        recurring: '',
        count: 1,
      },
    });
  }

  async confirm(t: TenantAccess, id: string) {
    const linkId = requireStudent(t);
    const db = this.prisma.tenant(t.tenantId);
    const att = await db.appointmentAttendee.findFirst({
      where: { appointmentId: id, studentLinkId: linkId, deletedAt: null },
    });
    if (!att || att.status === 'CANCELED') throw notFound('Aula não encontrada.');
    await db.appointmentAttendee.update({
      where: { id: att.id },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });
    const a = await db.appointment.findFirstOrThrow({ where: { id } });
    if (a.capacity === 1)
      await db.appointment.update({
        where: { id },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      });
    return this.get(t, id);
  }

  /** Aluno cancela dentro da política de antecedência. */
  async cancelMine(t: TenantAccess, id: string) {
    const linkId = requireStudent(t);
    const tenant = await this.tenantInfo(t.tenantId);
    const db = this.prisma.tenant(t.tenantId);
    const a = await db.appointment.findFirst({ where: { id, deletedAt: null } });
    const att =
      a &&
      (await db.appointmentAttendee.findFirst({
        where: { appointmentId: id, studentLinkId: linkId, deletedAt: null },
      }));
    if (!a || !att || att.status === 'CANCELED') throw notFound('Aula não encontrada.');
    if (!withinPolicy(a.startsAt, new Date(), tenant.cancelMinHours))
      throw badRequest(
        `Cancelamentos só até ${tenant.cancelMinHours} h antes. Fale com seu personal.`,
      );
    await db.appointmentAttendee.update({
      where: { id: att.id },
      data: { status: 'CANCELED', canceledAt: new Date() },
    });
    if (a.capacity === 1) {
      await db.appointment.update({ where: { id }, data: { status: 'CANCELED' } });
      this.calendar.queuePush([id]);
    }
    await this.notifyStaff(t.tenantId, id, linkId, 'cancelou');
    return { ok: true as const };
  }
}

@ApiTags('schedule')
@Controller('schedule')
export class ScheduleController {
  constructor(private readonly schedule: ScheduleService) {}

  @Get('availability')
  @Can('manage', 'schedule')
  @RequireFeature('schedule.calendar')
  availability(@CurrentTenant() t: TenantAccess) {
    return this.schedule.availability(t);
  }

  @Put('availability')
  @Can('manage', 'schedule')
  @RequireFeature('schedule.calendar')
  setAvailability(@CurrentTenant() t: TenantAccess, @Body() dto: AvailabilityDto) {
    return this.schedule.setAvailability(t, dto);
  }

  @Get('blocks')
  @Can('manage', 'schedule')
  @RequireFeature('schedule.calendar')
  blocks(@CurrentTenant() t: TenantAccess, @Query() q: RangeDto) {
    return this.schedule.blocks(t, q);
  }

  @Post('blocks')
  @Can('manage', 'schedule')
  @RequireFeature('schedule.calendar')
  addBlock(@CurrentTenant() t: TenantAccess, @Body() dto: BlockDto) {
    return this.schedule.addBlock(t, dto);
  }

  @Delete('blocks/:id')
  @Can('manage', 'schedule')
  @RequireFeature('schedule.calendar')
  deleteBlock(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.schedule.deleteBlock(t, id);
  }

  @Get('settings')
  @Can('read', 'schedule')
  @RequireFeature('schedule.calendar')
  getSettings(@CurrentTenant() t: TenantAccess) {
    return this.schedule.settings(t.tenantId);
  }

  @Put('settings')
  @Can('manage', 'settings')
  @RequireFeature('schedule.calendar')
  settings(@CurrentTenant() t: TenantAccess, @Body() dto: SettingsDto) {
    return this.schedule.settings(t.tenantId, dto);
  }

  @Get('appointments')
  @Can('read', 'schedule')
  @RequireFeature('schedule.calendar')
  list(@CurrentTenant() t: TenantAccess, @Query() q: RangeDto) {
    return this.schedule.list(t, q);
  }

  @Post('appointments')
  @Can('manage', 'schedule')
  @RequireFeature('schedule.calendar')
  create(@CurrentTenant() t: TenantAccess, @Body() dto: AppointmentDto) {
    return this.schedule.create(t, dto);
  }

  @Get('appointments/:id')
  @Can('read', 'schedule')
  @RequireFeature('schedule.calendar')
  get(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.schedule.get(t, id);
  }

  @Patch('appointments/:id')
  @Can('manage', 'schedule')
  @RequireFeature('schedule.calendar')
  update(
    @CurrentTenant() t: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AppointmentDto,
  ) {
    return this.schedule.update(t, id, dto);
  }

  @Post('appointments/:id/cancel')
  @HttpCode(200)
  @Can('manage', 'schedule')
  @RequireFeature('schedule.calendar')
  cancel(
    @CurrentTenant() t: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelDto,
  ) {
    return this.schedule.cancel(t, id, dto.scope);
  }

  @Post('appointments/:id/attendance')
  @HttpCode(200)
  @Can('manage', 'schedule')
  @RequireFeature('schedule.calendar')
  attendance(
    @CurrentTenant() t: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttendanceDto,
  ) {
    return this.schedule.attendance(t, id, dto);
  }

  @Post('appointments/:id/attendees')
  @Can('manage', 'schedule')
  @RequireFeature('schedule.calendar')
  addAttendee(
    @CurrentTenant() t: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttendeeDto,
  ) {
    return this.schedule.addAttendee(t, id, dto.studentLinkId);
  }

  // Aluno
  @Get('slots')
  @Can('update', 'schedule')
  @RequireFeature('schedule.calendar')
  slots(@CurrentTenant() t: TenantAccess, @Query() q: RangeDto) {
    requireStudent(t);
    return this.schedule.slots(t, q);
  }

  @Post('book')
  @Can('update', 'schedule')
  @RequireFeature('schedule.calendar')
  book(@CurrentTenant() t: TenantAccess, @Body() dto: BookDto) {
    return this.schedule.book(t, dto);
  }

  @Post('appointments/:id/confirm')
  @HttpCode(200)
  @Can('update', 'schedule')
  @RequireFeature('schedule.calendar')
  confirm(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.schedule.confirm(t, id);
  }

  @Post('appointments/:id/leave')
  @HttpCode(200)
  @Can('update', 'schedule')
  @RequireFeature('schedule.calendar')
  leave(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.schedule.cancelMine(t, id);
  }
}
