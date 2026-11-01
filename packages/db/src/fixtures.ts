import type { PlanCode, PrismaClient, SubscriptionStatus } from '../generated/client';

export interface TenantWorldOptions {
  slug: string;
  ownerName: string;
  ownerEmail: string;
  businessName: string;
  plan: PlanCode;
  subscriptionStatus?: SubscriptionStatus;
  trialEndsAt?: Date | null;
  passwordHash?: string | null;
  students: { name: string; email: string }[];
}

export interface TenantWorld {
  tenantId: string;
  ownerUserId: string;
  ownerMemberId: string;
  studentUserIds: string[];
  studentLinkIds: string[];
  /** Ids criados por modelo (para testes de isolamento). */
  rows: Record<string, string[]>;
}

const days = (n: number) => new Date(Date.now() + n * 86_400_000);

/**
 * Cria um tenant completo com ao menos uma linha em cada tabela de negócio.
 * Usado pelo seed de desenvolvimento e pelos testes de isolamento.
 * Executa com o cliente de sistema.
 */
export async function createTenantWorld(
  db: PrismaClient,
  o: TenantWorldOptions,
): Promise<TenantWorld> {
  const rows: Record<string, string[]> = {};
  const track = <T extends { id: string }>(model: string, r: T): T => {
    (rows[model] ??= []).push(r.id);
    return r;
  };

  const plan = await db.plan.findUniqueOrThrow({ where: { code: o.plan } });
  const owner = await db.user.create({
    data: {
      email: o.ownerEmail,
      name: o.ownerName,
      passwordHash: o.passwordHash ?? null,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  const tenant = track(
    'Tenant',
    await db.tenant.create({
      data: { slug: o.slug, name: o.businessName, ownerUserId: owner.id, cref: '012345-G/SP' },
    }),
  );
  const tenantId = tenant.id;
  const owner_m = track(
    'TenantMember',
    await db.tenantMember.create({ data: { tenantId, userId: owner.id, role: 'OWNER' } }),
  );
  const status = o.subscriptionStatus ?? (o.plan === 'FREE' ? 'ACTIVE' : 'ACTIVE');
  const sub = track(
    'TenantSubscription',
    await db.tenantSubscription.create({
      data: {
        tenantId,
        planId: plan.id,
        status,
        trialEndsAt: o.trialEndsAt ?? null,
        currentPeriodStart: new Date(),
        currentPeriodEnd: days(30),
      },
    }),
  );
  track(
    'TenantStorageUsage',
    await db.tenantStorageUsage.create({ data: { tenantId, bytesUsed: BigInt(1024 * 1024) } }),
  );
  track(
    'TenantFeatureOverride',
    await db.tenantFeatureOverride.create({
      data: {
        tenantId,
        featureKey: 'support.priority',
        value: 1,
        reason: 'Fixture',
        expiresAt: days(7),
      },
    }),
  );
  track(
    'PlatformInvoice',
    await db.platformInvoice.create({
      data: {
        tenantId,
        subscriptionId: sub.id,
        amountCents: o.plan === 'FREE' ? 0 : o.plan === 'PRO' ? 3990 : 7990,
        status: 'PAID',
        method: 'PIX',
        dueDate: new Date(),
        paidAt: new Date(),
        periodStart: new Date(),
        periodEnd: days(30),
      },
    }),
  );

  // Alunos
  const studentUserIds: string[] = [];
  const studentLinkIds: string[] = [];
  for (const s of o.students) {
    const u = await db.user.upsert({
      where: { email: s.email },
      create: {
        email: s.email,
        name: s.name,
        passwordHash: o.passwordHash ?? null,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
      update: {},
    });
    const link = track(
      'StudentLink',
      await db.studentLink.create({
        data: {
          tenantId,
          userId: u.id,
          displayName: s.name,
          email: s.email,
          status: 'ACTIVE',
          joinedAt: new Date(),
          lastActivityAt: new Date(),
          goal: 'Hipertrofia',
        },
      }),
    );
    studentUserIds.push(u.id);
    studentLinkIds.push(link.id);
  }
  const firstStudent = studentLinkIds[0];
  if (!firstStudent) throw new Error('createTenantWorld exige ao menos 1 aluno');

  // M2
  const group = track(
    'StudentGroup',
    await db.studentGroup.create({ data: { tenantId, name: 'Manhã' } }),
  );
  track(
    'StudentGroupMember',
    await db.studentGroupMember.create({
      data: { tenantId, groupId: group.id, studentLinkId: firstStudent },
    }),
  );
  track(
    'StudentActivity',
    await db.studentActivity.create({
      data: {
        tenantId,
        studentLinkId: firstStudent,
        type: 'joined',
        title: 'Entrou na consultoria',
        occurredAt: new Date(),
      },
    }),
  );

  // M5
  const folder = track(
    'ExerciseFolder',
    await db.exerciseFolder.create({ data: { tenantId, name: 'Meus exercícios' } }),
  );
  const exercise = track(
    'Exercise',
    await db.exercise.create({
      data: {
        tenantId,
        folderId: folder.id,
        name: 'Agachamento búlgaro',
        primaryMuscles: ['quadríceps', 'glúteos'],
        equipment: ['halteres'],
        createdByUserId: owner.id,
      },
    }),
  );
  track(
    'ExerciseFavorite',
    await db.exerciseFavorite.create({
      data: { tenantId, exerciseId: exercise.id, userId: owner.id },
    }),
  );

  // Mídia
  const media = track(
    'Media',
    await db.media.create({
      data: {
        tenantId,
        ownerUserId: owner.id,
        studentLinkId: firstStudent,
        purpose: 'progress_photo',
        status: 'READY',
        bucket: 'vetta-media',
        storageKey: `t/${tenantId}/progress_photo/fixture-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
        fileName: 'frente.jpg',
        mimeType: 'image/jpeg',
        size: BigInt(1024 * 1024),
        uploadExpiresAt: days(1),
        uploadedAt: new Date(),
        processedAt: new Date(),
      },
    }),
  );

  // M6
  const program = track(
    'WorkoutProgram',
    await db.workoutProgram.create({
      data: {
        tenantId,
        studentLinkId: firstStudent,
        createdByMemberId: owner_m.id,
        name: 'Hipertrofia – Fase 1',
        status: 'ACTIVE',
        startsOn: new Date(),
      },
    }),
  );
  const routine = track(
    'WorkoutRoutine',
    await db.workoutRoutine.create({
      data: { tenantId, programId: program.id, label: 'A', name: 'Inferiores' },
    }),
  );
  const rex = track(
    'RoutineExercise',
    await db.routineExercise.create({
      data: {
        tenantId,
        routineId: routine.id,
        exerciseId: exercise.id,
        restSeconds: 90,
        method: 'STANDARD',
      },
    }),
  );
  for (let i = 0; i < 3; i++) {
    track(
      'ExerciseSet',
      await db.exerciseSet.create({
        data: {
          tenantId,
          routineExerciseId: rex.id,
          sortOrder: i,
          reps: '10-12',
          targetLoadKg: 20,
        },
      }),
    );
  }
  const periodization = track(
    'Periodization',
    await db.periodization.create({
      data: {
        tenantId,
        studentLinkId: firstStudent,
        name: 'Macrociclo 2026',
        startsOn: new Date(),
      },
    }),
  );
  track(
    'PeriodizationPhase',
    await db.periodizationPhase.create({
      data: {
        tenantId,
        periodizationId: periodization.id,
        programId: program.id,
        name: 'Adaptação',
        weeks: 4,
      },
    }),
  );

  // M7
  const session = track(
    'WorkoutSession',
    await db.workoutSession.create({
      data: {
        tenantId,
        studentLinkId: firstStudent,
        programId: program.id,
        routineId: routine.id,
        clientId: `fixture-${tenantId}`,
        startedAt: days(-1),
        finishedAt: days(-1),
        durationSeconds: 3600,
        perceivedEffort: 7,
        feedback: 'Treino pesado, mas foi!',
      },
    }),
  );
  track(
    'SessionSetLog',
    await db.sessionSetLog.create({
      data: {
        tenantId,
        sessionId: session.id,
        routineExerciseId: rex.id,
        exerciseId: exercise.id,
        setOrder: 0,
        reps: 12,
        loadKg: 20,
      },
    }),
  );
  track(
    'PersonalRecord',
    await db.personalRecord.create({
      data: {
        tenantId,
        studentLinkId: firstStudent,
        exerciseId: exercise.id,
        sessionId: session.id,
        type: 'MAX_LOAD',
        value: 20,
        achievedAt: days(-1),
      },
    }),
  );

  // M3 / M4 / M8
  const template = track(
    'AnamnesisTemplate',
    await db.anamnesisTemplate.create({
      data: { tenantId, kind: 'CUSTOM', name: 'Anamnese da casa', schema: { questions: [] } },
    }),
  );
  track(
    'AnamnesisResponse',
    await db.anamnesisResponse.create({
      data: { tenantId, studentLinkId: firstStudent, templateId: template.id, templateVersion: 1 },
    }),
  );
  track(
    'PhysicalAssessment',
    await db.physicalAssessment.create({
      data: {
        tenantId,
        studentLinkId: firstStudent,
        assessorMemberId: owner_m.id,
        assessedAt: new Date(),
        weightKg: 80,
        heightCm: 180,
        results: { bmi: 24.69 },
      },
    }),
  );
  const posture = track(
    'PostureAssessment',
    await db.postureAssessment.create({
      data: { tenantId, studentLinkId: firstStudent, assessedAt: new Date() },
    }),
  );
  track(
    'PosturePhoto',
    await db.posturePhoto.create({
      data: { tenantId, postureAssessmentId: posture.id, mediaId: media.id, view: 'FRONT' },
    }),
  );
  track(
    'ProgressPhoto',
    await db.progressPhoto.create({
      data: {
        tenantId,
        studentLinkId: firstStudent,
        mediaId: media.id,
        view: 'FRONT',
        takenAt: new Date(),
      },
    }),
  );
  track(
    'BodyMeasurement',
    await db.bodyMeasurement.create({
      data: {
        tenantId,
        studentLinkId: firstStudent,
        measuredAt: new Date(),
        weightKg: 80,
        bodyFatPct: 18,
      },
    }),
  );

  // M9 / M10
  const conversation = track(
    'Conversation',
    await db.conversation.create({
      data: { tenantId, studentLinkId: firstStudent, lastMessageAt: new Date() },
    }),
  );
  track(
    'Message',
    await db.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        senderUserId: owner.id,
        body: 'Bora treinar hoje?',
      },
    }),
  );
  track(
    'Broadcast',
    await db.broadcast.create({
      data: {
        tenantId,
        createdByUserId: owner.id,
        title: 'Feriado',
        body: 'Sem atendimento presencial na segunda.',
        audience: { all: true },
        channels: ['IN_APP'],
      },
    }),
  );
  track(
    'Appointment',
    await db.appointment.create({
      data: {
        tenantId,
        memberId: owner_m.id,
        studentLinkId: firstStudent,
        title: 'Avaliação',
        startsAt: days(2),
        endsAt: new Date(days(2).getTime() + 3_600_000),
      },
    }),
  );
  track(
    'CalendarIntegration',
    await db.calendarIntegration.create({ data: { tenantId, memberId: owner_m.id } }),
  );

  // M11
  const cplan = track(
    'ConsultingPlan',
    await db.consultingPlan.create({
      data: {
        tenantId,
        name: 'Consultoria mensal',
        priceCents: 19900,
        isPublic: true,
        benefits: ['Treino', 'Chat'],
      },
    }),
  );
  const ssub = track(
    'StudentSubscription',
    await db.studentSubscription.create({
      data: {
        tenantId,
        studentLinkId: firstStudent,
        consultingPlanId: cplan.id,
        startedAt: new Date(),
        nextDueDate: days(30),
        method: 'PIX',
      },
    }),
  );
  const invoice = track(
    'Invoice',
    await db.invoice.create({
      data: {
        tenantId,
        studentLinkId: firstStudent,
        studentSubscriptionId: ssub.id,
        description: 'Consultoria mensal',
        amountCents: 19900,
        netCents: 19305,
        platformFeeCents: 595,
        status: 'PAID',
        method: 'PIX',
        dueDate: new Date(),
        paidAt: new Date(),
      },
    }),
  );
  track(
    'PaymentAccount',
    await db.paymentAccount.create({ data: { tenantId, status: 'APPROVED' } }),
  );
  const withdrawal = track(
    'Withdrawal',
    await db.withdrawal.create({
      data: { tenantId, amountCents: 10000, status: 'DONE', completedAt: new Date() },
    }),
  );
  track(
    'WalletEntry',
    await db.walletEntry.create({
      data: {
        tenantId,
        type: 'CREDIT',
        amountCents: 19305,
        invoiceId: invoice.id,
        description: 'Pagamento',
        occurredAt: new Date(),
      },
    }),
  );
  track(
    'WalletEntry',
    await db.walletEntry.create({
      data: {
        tenantId,
        type: 'WITHDRAWAL',
        amountCents: -10000,
        withdrawalId: withdrawal.id,
        description: 'Saque',
        occurredAt: new Date(),
      },
    }),
  );
  track(
    'Expense',
    await db.expense.create({
      data: {
        tenantId,
        description: 'Aluguel do estúdio',
        category: 'Estrutura',
        amountCents: 150000,
        paidOn: new Date(),
      },
    }),
  );

  // M12 / M13
  track(
    'TenantBrand',
    await db.tenantBrand.create({ data: { tenantId, primaryColor: '#2F5BFF' } }),
  );
  track(
    'SalesPage',
    await db.salesPage.create({
      data: {
        tenantId,
        headline: `Treine com ${o.ownerName}`,
        isPublished: true,
        publishedAt: new Date(),
      },
    }),
  );
  track(
    'StudentDocument',
    await db.studentDocument.create({
      data: {
        tenantId,
        studentLinkId: firstStudent,
        mediaId: media.id,
        uploadedByUserId: owner.id,
        title: 'Exame de sangue',
        category: 'EXAM',
      },
    }),
  );

  return {
    tenantId,
    ownerUserId: owner.id,
    ownerMemberId: owner_m.id,
    studentUserIds,
    studentLinkIds,
    rows,
  };
}
