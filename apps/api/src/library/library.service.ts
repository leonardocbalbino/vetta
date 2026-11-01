import { Inject, Injectable } from '@nestjs/common';
import {
  EXERCISE_CSV_COLUMNS,
  ExerciseCategory,
  ExerciseInputSchema,
  ExerciseLevel,
  SIGNED_URL_TTL_SECONDS,
  exerciseSearchText,
  normalizeText,
  type ExerciseInput,
  type ExerciseQuery,
} from '@vetta/contracts';
import type { Exercise, Prisma } from '@vetta/db';
import type { StorageProvider } from '@vetta/server';
import { badRequest, forbidden, notFound } from '../common/errors';
import { page } from '../common/scope';
import type { TenantAccess } from '../common/request';
import { STORAGE } from '../infra/infra.module';
import { PrismaService } from '../infra/prisma.service';

const CATEGORY_PT: Record<string, ExerciseCategory> = {
  forca: 'STRENGTH',
  força: 'STRENGTH',
  cardio: 'CARDIO',
  mobilidade: 'MOBILITY',
  alongamento: 'STRETCHING',
  funcional: 'FUNCTIONAL',
  pliometria: 'PLYOMETRIC',
};
const LEVEL_PT: Record<string, ExerciseLevel> = {
  iniciante: 'BEGINNER',
  intermediario: 'INTERMEDIATE',
  avancado: 'ADVANCED',
};

/** CSV simples com aspas, separador ; ou , (detectado pelo cabeçalho). */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (!lines.length) return [];
  const sep =
    (lines[0]!.match(/;/g)?.length ?? 0) >= (lines[0]!.match(/,/g)?.length ?? 0) ? ';' : ',';
  const split = (line: string) => {
    const out: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = !quoted;
      } else if (ch === sep && !quoted) {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out.map((v) => v.trim());
  };
  const header = split(lines[0]!).map((h) => normalizeText(h).replace(/\s+/g, '_'));
  return lines.slice(1).map((l) => {
    const cells = split(l);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
  });
}

const list = (v: string | undefined) =>
  (v ?? '')
    .split(/[|,]/)
    .map((s) => s.trim())
    .filter(Boolean);

@Injectable()
export class LibraryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
  ) {}

  private dataFrom(input: ExerciseInput) {
    return {
      name: input.name,
      aliases: input.aliases,
      category: input.category,
      level: input.level,
      primaryMuscles: input.primaryMuscles.map((m) => m.toLowerCase()),
      secondaryMuscles: input.secondaryMuscles.map((m) => m.toLowerCase()),
      equipment: input.equipment.map((m) => m.toLowerCase()),
      instructions: input.instructions ?? null,
      tips: input.tips ?? null,
      commonMistakes: input.commonMistakes ?? null,
      videoMediaId: input.videoMediaId ?? null,
      imageMediaId: input.imageMediaId ?? null,
      gifMediaId: input.gifMediaId ?? null,
      externalVideoUrl: input.externalVideoUrl ?? null,
      searchText: exerciseSearchText(input),
      ...(input.code ? { code: input.code } : {}),
    };
  }

  /** URLs assinadas das mídias (thumbnail/vídeo) de uma lista de exercícios. */
  async withMedia<T extends Pick<Exercise, 'videoMediaId' | 'imageMediaId' | 'gifMediaId'>>(
    items: T[],
  ) {
    const ids = [
      ...new Set(
        items
          .flatMap((e) => [e.videoMediaId, e.imageMediaId, e.gifMediaId])
          .filter((x): x is string => !!x),
      ),
    ];
    const media = ids.length
      ? await this.prisma.system.media.findMany({
          where: { id: { in: ids }, status: 'READY', deletedAt: null },
        })
      : [];
    const urls = new Map<string, Record<string, string>>();
    for (const m of media) {
      const v = (m.variants ?? {}) as Record<string, { key: string }>;
      const sign = async (key: string) =>
        key.startsWith('http') ? key : this.storage.presignGet(key, SIGNED_URL_TTL_SECONDS);
      const entry: Record<string, string> = { original: await sign(m.storageKey) };
      for (const [name, val] of Object.entries(v)) entry[name] = await sign(val.key);
      urls.set(m.id, entry);
    }
    return items.map((e) => ({
      ...e,
      media: {
        video: e.videoMediaId
          ? (urls.get(e.videoMediaId)?.hls ?? urls.get(e.videoMediaId)?.original ?? null)
          : null,
        thumbnail:
          (e.videoMediaId && urls.get(e.videoMediaId)?.thumbnail) ||
          (e.imageMediaId &&
            (urls.get(e.imageMediaId)?.thumbnail ?? urls.get(e.imageMediaId)?.original)) ||
          null,
        gif: e.gifMediaId
          ? (urls.get(e.gifMediaId)?.original ?? null)
          : (e.videoMediaId && urls.get(e.videoMediaId)?.preview_gif) || null,
        image: e.imageMediaId
          ? (urls.get(e.imageMediaId)?.webp ?? urls.get(e.imageMediaId)?.original ?? null)
          : null,
      },
    }));
  }

  private where(q: ExerciseQuery, tenantId: string | null): Prisma.ExerciseWhereInput {
    const and: Prisma.ExerciseWhereInput[] = [{ deletedAt: null, isActive: true }];
    if (q.q) {
      for (const term of normalizeText(q.q).split(' ').filter(Boolean))
        and.push({ searchText: { contains: term } });
    }
    if (q.category) and.push({ category: q.category });
    if (q.level) and.push({ level: q.level });
    if (q.muscle) {
      const m = q.muscle.toLowerCase();
      and.push({ OR: [{ primaryMuscles: { has: m } }, { secondaryMuscles: { has: m } }] });
    }
    if (q.equipment) and.push({ equipment: { has: q.equipment.toLowerCase() } });
    if (q.folderId) and.push({ folderId: q.folderId });
    if (q.scope === 'global') and.push({ tenantId: null });
    if (q.scope === 'mine' && tenantId) and.push({ tenantId });
    return { AND: and };
  }

  async search(t: TenantAccess, userId: string, q: ExerciseQuery) {
    const db = this.prisma.tenant(t.tenantId);
    const where = this.where(q, t.tenantId);
    if (q.scope === 'favorites') {
      where.AND = [
        ...(where.AND as Prisma.ExerciseWhereInput[]),
        { favorites: { some: { userId, deletedAt: null } } },
      ];
    }
    const items = await db.exercise.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: { favorites: { where: { userId, deletedAt: null }, select: { id: true } } },
    });
    const res = page(items, q.limit);
    const withMedia = await this.withMedia(res.items);
    return {
      items: withMedia.map(({ favorites, ...e }) => ({
        ...e,
        isGlobal: e.tenantId === null,
        isFavorite: favorites.length > 0,
      })),
      nextCursor: res.nextCursor,
    };
  }

  async get(t: TenantAccess, id: string) {
    const db = this.prisma.tenant(t.tenantId);
    const e = await db.exercise.findFirst({ where: { id, deletedAt: null } });
    if (!e) throw notFound('Exercício não encontrado.');
    const [withMedia] = await this.withMedia([e]);
    return {
      ...withMedia!,
      isGlobal: e.tenantId === null,
      equivalents: await this.equivalents(t, e),
    };
  }

  /** Equivalentes sugeridos para troca no player: mesmo músculo principal e tipo. */
  async equivalents(t: TenantAccess, e: Exercise) {
    const muscle = e.primaryMuscles[0];
    if (!muscle) return [];
    return this.prisma.tenant(t.tenantId).exercise.findMany({
      where: {
        id: { not: e.id },
        deletedAt: null,
        isActive: true,
        category: e.category,
        primaryMuscles: { has: muscle },
      },
      select: { id: true, name: true, equipment: true, tenantId: true },
      orderBy: { name: 'asc' },
      take: 6,
    });
  }

  async create(t: TenantAccess, userId: string, input: ExerciseInput) {
    const db = this.prisma.tenant(t.tenantId);
    if (input.folderId) await this.ownFolder(t, input.folderId);
    return db.exercise.create({
      data: {
        ...this.dataFrom(input),
        folderId: input.folderId ?? null,
        createdByUserId: userId,
      } as never,
    });
  }

  async update(t: TenantAccess, id: string, input: ExerciseInput) {
    const db = this.prisma.tenant(t.tenantId);
    const e = await db.exercise.findFirst({ where: { id, deletedAt: null } });
    if (!e) throw notFound('Exercício não encontrado.');
    if (e.tenantId === null)
      throw forbidden(
        'Exercícios da biblioteca Vetta não podem ser editados. Duplique para personalizar.',
      );
    if (input.folderId) await this.ownFolder(t, input.folderId);
    return db.exercise.update({
      where: { id },
      data: { ...this.dataFrom(input), folderId: input.folderId ?? null },
    });
  }

  /** Copia um exercício (inclusive global) para a biblioteca própria. */
  async duplicate(t: TenantAccess, userId: string, id: string) {
    const db = this.prisma.tenant(t.tenantId);
    const e = await db.exercise.findFirst({ where: { id, deletedAt: null } });
    if (!e) throw notFound('Exercício não encontrado.');
    const {
      id: _id,
      tenantId: _t,
      code: _c,
      createdAt: _ca,
      updatedAt: _u,
      deletedAt: _d,
      folderId: _f,
      createdByAdminId: _a,
      ...rest
    } = e;
    return db.exercise.create({
      data: { ...rest, name: `${e.name} (cópia)`, createdByUserId: userId } as never,
    });
  }

  async remove(t: TenantAccess, id: string) {
    const r = await this.prisma.tenant(t.tenantId).exercise.updateMany({
      where: { id, tenantId: t.tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (!r.count) throw notFound('Exercício não encontrado.');
    return { ok: true as const };
  }

  async favorite(t: TenantAccess, userId: string, id: string, on: boolean) {
    const db = this.prisma.tenant(t.tenantId);
    const e = await db.exercise.findFirst({ where: { id, deletedAt: null } });
    if (!e) throw notFound('Exercício não encontrado.');
    const existing = await db.exerciseFavorite.findFirst({ where: { userId, exerciseId: id } });
    if (on) {
      if (existing)
        await db.exerciseFavorite.update({ where: { id: existing.id }, data: { deletedAt: null } });
      else await db.exerciseFavorite.create({ data: { exerciseId: id, userId } as never });
    } else if (existing) {
      await db.exerciseFavorite.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });
    }
    return { ok: true as const, favorite: on };
  }

  private async ownFolder(t: TenantAccess, id: string) {
    const f = await this.prisma
      .tenant(t.tenantId)
      .exerciseFolder.findFirst({ where: { id, deletedAt: null } });
    if (!f) throw notFound('Pasta não encontrada.');
    return f;
  }

  folders(t: TenantAccess) {
    return this.prisma.tenant(t.tenantId).exerciseFolder.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { exercises: { where: { deletedAt: null } } } } },
    });
  }

  async createFolder(t: TenantAccess, name: string, parentId?: string | null) {
    if (parentId) await this.ownFolder(t, parentId);
    return this.prisma
      .tenant(t.tenantId)
      .exerciseFolder.create({ data: { name, parentId: parentId ?? null } as never });
  }

  async updateFolder(t: TenantAccess, id: string, name: string) {
    await this.ownFolder(t, id);
    return this.prisma.tenant(t.tenantId).exerciseFolder.update({ where: { id }, data: { name } });
  }

  async removeFolder(t: TenantAccess, id: string) {
    await this.ownFolder(t, id);
    const db = this.prisma.tenant(t.tenantId);
    await db.exercise.updateMany({ where: { folderId: id }, data: { folderId: null } });
    await db.exerciseFolder.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true as const };
  }

  // ─── Biblioteca global (admin) ───────────────────────────────────────────

  async adminSearch(q: ExerciseQuery) {
    const items = await this.prisma.platform.exercise.findMany({
      where: { ...this.where({ ...q, scope: 'all' }, null), tenantId: null },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const res = page(items, q.limit);
    return { items: await this.withMedia(res.items), nextCursor: res.nextCursor };
  }

  adminCreate(adminId: string, input: ExerciseInput) {
    return this.prisma.platform.exercise.create({
      data: { ...this.dataFrom(input), tenantId: null, createdByAdminId: adminId },
    });
  }

  async adminUpdate(id: string, input: ExerciseInput) {
    const e = await this.prisma.platform.exercise.findFirst({
      where: { id, tenantId: null, deletedAt: null },
    });
    if (!e) throw notFound('Exercício não encontrado.');
    return this.prisma.platform.exercise.update({ where: { id }, data: this.dataFrom(input) });
  }

  async adminRemove(id: string) {
    await this.prisma.platform.exercise.updateMany({
      where: { id, tenantId: null },
      data: { deletedAt: new Date() },
    });
    return { ok: true as const };
  }

  /**
   * Importação em lote (CSV + vídeos já enviados). Upsert por código; a coluna
   * "video" referencia o nome do arquivo, mapeado para o mediaId do upload.
   */
  async adminImport(
    adminId: string,
    csv: string,
    videos: { fileName: string; mediaId: string }[],
    dryRun: boolean,
  ) {
    const rows = parseCsv(csv);
    if (!rows.length) throw badRequest('CSV vazio.');
    const missingCols = ['codigo', 'nome'].filter((c) => !(c in rows[0]!));
    if (missingCols.length) {
      throw badRequest(
        `Colunas obrigatórias ausentes: ${missingCols.join(', ')}`,
        'VALIDATION_ERROR',
        { expected: EXERCISE_CSV_COLUMNS },
      );
    }
    const byFile = new Map(videos.map((v) => [v.fileName.toLowerCase(), v.mediaId]));
    const errors: { line: number; message: string }[] = [];
    let created = 0;
    let updated = 0;
    for (const [i, r] of rows.entries()) {
      const line = i + 2;
      const video = r.video ? byFile.get(r.video.toLowerCase()) : undefined;
      if (r.video && !video)
        errors.push({ line, message: `vídeo "${r.video}" não enviado (importado sem vídeo)` });
      const parsed = ExerciseInputSchema.safeParse({
        code: r.codigo,
        name: r.nome,
        aliases: list(r.apelidos),
        category: CATEGORY_PT[normalizeText(r.tipo ?? '')] ?? 'STRENGTH',
        level: LEVEL_PT[normalizeText(r.nivel ?? '')] ?? 'BEGINNER',
        primaryMuscles: list(r.musculos_primarios),
        secondaryMuscles: list(r.musculos_secundarios),
        equipment: list(r.equipamentos),
        instructions: r.instrucoes || null,
        tips: r.dicas || null,
        commonMistakes: r.erros_comuns || null,
        ...(video ? { videoMediaId: video } : {}),
      });
      if (!parsed.success || !parsed.data.code) {
        errors.push({
          line,
          message: parsed.success ? 'código obrigatório' : parsed.error.issues[0]!.message,
        });
        continue;
      }
      if (dryRun) continue;
      const exists = await this.prisma.platform.exercise.findFirst({
        where: { tenantId: null, code: parsed.data.code },
      });
      const data = this.dataFrom(parsed.data);
      if (exists) {
        await this.prisma.platform.exercise.update({
          where: { id: exists.id },
          data: { ...data, deletedAt: null },
        });
        updated++;
      } else {
        await this.prisma.platform.exercise.create({
          data: { ...data, tenantId: null, createdByAdminId: adminId },
        });
        created++;
      }
    }
    return { rows: rows.length, created, updated, errors, dryRun };
  }

  /** Fila de vídeos da biblioteca global em processamento/falha. */
  videoQueue() {
    return this.prisma.platform.media.findMany({
      where: {
        purpose: 'exercise_video',
        tenantId: null,
        status: { in: ['PENDING', 'UPLOADED', 'PROCESSING', 'FAILED'] },
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        fileName: true,
        status: true,
        failureReason: true,
        createdAt: true,
        size: true,
      },
    });
  }
}
