import * as C from '@vetta/contracts';
import { describe, expect, it } from 'vitest';
import { $Enums } from '../generated/client';
import { injectTenant } from './tenancy';

describe('enums do Prisma = enums de @vetta/contracts', () => {
  const pairs: [string, readonly string[], Record<string, string>][] = [
    ['PlatformRole', C.PlatformRole, $Enums.PlatformRole],
    ['UserStatus', C.UserStatus, $Enums.UserStatus],
    ['TenantStatus', C.TenantStatus, $Enums.TenantStatus],
    ['TenantMemberRole', C.TenantMemberRole, $Enums.TenantMemberRole],
    ['StudentLinkStatus', C.StudentLinkStatus, $Enums.StudentLinkStatus],
    ['PlanCode', C.PlanCode, $Enums.PlanCode],
    ['FeatureType', C.FeatureType, $Enums.FeatureType],
    ['BillingCycle', C.BillingCycle, $Enums.BillingCycle],
    ['SubscriptionStatus', C.SubscriptionStatus, $Enums.SubscriptionStatus],
    ['DevicePlatform', C.DevicePlatform, $Enums.DevicePlatform],
    ['AuthProvider', C.AuthProvider, $Enums.AuthProvider],
    ['MediaStatus', C.MediaStatus, $Enums.MediaStatus],
    ['NotificationChannel', C.NotificationChannel, $Enums.NotificationChannel],
    ['NotificationCategory', C.NotificationCategory, $Enums.NotificationCategory],
    ['DeliveryStatus', C.DeliveryStatus, $Enums.DeliveryStatus],
    ['UploadPurpose', C.UploadPurpose, $Enums.UploadPurpose],
  ];
  it.each(pairs)('%s', (_n, contract, prisma) => {
    expect([...contract].sort()).toEqual(Object.values(prisma).sort());
  });
});

describe('injectTenant', () => {
  const T = '0190f1e2-0000-7000-8000-000000000001';
  it('adiciona tenantId em leituras e escritas', () => {
    expect(injectTenant('StudentGroup', 'findMany', { where: { name: 'x' } }, T).where).toEqual({
      name: 'x',
      tenantId: T,
    });
    expect(injectTenant('StudentGroup', 'create', { data: { name: 'x' } }, T).data).toEqual({
      name: 'x',
      tenantId: T,
    });
    expect(injectTenant('StudentGroup', 'createMany', { data: [{ name: 'x' }] }, T).data).toEqual([
      { name: 'x', tenantId: T },
    ]);
    expect(injectTenant('StudentGroup', 'deleteMany', {}, T).where).toEqual({ tenantId: T });
  });
  it('modelos compartilhados leem linhas globais', () => {
    expect(injectTenant('Exercise', 'findMany', {}, T).where).toEqual({
      AND: [{ OR: [{ tenantId: T }, { tenantId: null }] }],
    });
    expect(injectTenant('Exercise', 'updateMany', {}, T).where).toEqual({ tenantId: T });
  });
  it('não toca modelos globais', () => {
    expect(injectTenant('User', 'findMany', { where: { email: 'a' } }, T).where).toEqual({
      email: 'a',
    });
  });
  it('Tenant é filtrado pelo próprio id', () => {
    expect(injectTenant('Tenant', 'findMany', {}, T).where).toEqual({ id: T });
  });
});
