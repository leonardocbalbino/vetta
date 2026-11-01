import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiHeader, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import type {
  Action,
  FeatureKey,
  LimitFeatureKey,
  PlatformRole,
  Resource,
  Role,
} from '@vetta/contracts';

export const META = {
  public: 'vetta:public',
  can: 'vetta:can',
  tenant: 'vetta:tenant',
  admin: 'vetta:admin',
  roles: 'vetta:roles',
  feature: 'vetta:feature',
  limit: 'vetta:limit',
  optionalTenant: 'vetta:optional-tenant',
  allowAdmin: 'vetta:allow-admin',
} as const;

const tenantHeader = ApiHeader({
  name: 'X-Tenant-Id',
  required: true,
  description: 'Vínculo ativo (tenant)',
});

/** Rota sem autenticação. */
export const Public = () => SetMetadata(META.public, true);

/** Exige o tenant ativo (X-Tenant-Id) sem checar permissão específica. */
export const TenantScoped = () =>
  applyDecorators(SetMetadata(META.tenant, true), tenantHeader, ApiSecurity('bearer'));

/** Usa o tenant se o header vier, mas não exige (ex.: uploads de avatar). */
export const OptionalTenant = () => SetMetadata(META.optionalTenant, true);

/**
 * Autorização por papel: can(role, action, resource).
 * Recursos de tenant implicam X-Tenant-Id; recursos "platform.*" implicam admin.
 */
export const Can = (action: Action, resource: Resource) => {
  const platform = resource.startsWith('platform.');
  return applyDecorators(
    SetMetadata(META.can, { action, resource }),
    ...(platform
      ? [SetMetadata(META.admin, true)]
      : [SetMetadata(META.tenant, true), tenantHeader]),
    ApiSecurity('bearer'),
    ApiResponse({ status: 403, description: 'Papel sem permissão' }),
    ...(platform ? [] : [ApiResponse({ status: 404, description: 'Tenant sem vínculo' })]),
  );
};

/** Rota exclusiva da equipe da plataforma (opcionalmente restrita a papéis). */
export const AdminOnly = (...roles: PlatformRole[]) =>
  applyDecorators(
    SetMetadata(META.admin, true),
    SetMetadata(META.roles, roles),
    ApiSecurity('bearer'),
  );

export const Roles = (...roles: Role[]) => SetMetadata(META.roles, roles);

/** Plano precisa liberar a feature (402 FEATURE_LOCKED com requiredPlan). */
export const RequireFeature = (key: FeatureKey) =>
  applyDecorators(
    SetMetadata(META.feature, key),
    ApiResponse({ status: 402, description: 'FEATURE_LOCKED' }),
  );

/** Antes de criar um recurso: uso + 1 precisa caber no limite (402 LIMIT_REACHED). */
export const AssertLimit = (key: LimitFeatureKey) =>
  applyDecorators(
    SetMetadata(META.limit, key),
    ApiResponse({ status: 402, description: 'LIMIT_REACHED' }),
  );

/** Rota de usuário que também aceita a equipe da plataforma (ex.: uploads da biblioteca global). */
export const AllowAdmin = () => SetMetadata(META.allowAdmin, true);
