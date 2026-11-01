import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, type Action, type LimitFeatureKey, type Resource, type Role } from '@vetta/contracts';
import { badRequest, forbidden, unauthorized } from '../common/errors';
import type { AppRequest, Principal } from '../common/request';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { TokensService } from '../auth/tokens.service';
import { PrismaService } from '../infra/prisma.service';
import { META } from './decorators';
import { TenantAccessService } from './tenant-access.service';

/**
 * Guard único (CLAUDE.md §8): autenticação → tenant ativo → can(papel, ação, recurso)
 * → hasFeature(plano) → limite. Ordem dos erros: 401, 404 (outro tenant), 403 (papel), 402 (plano).
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    private readonly tenants: TenantAccessService,
    private readonly entitlements: EntitlementsService,
    private readonly prisma: PrismaService,
  ) {}

  private meta<T>(key: string, ctx: ExecutionContext): T | undefined {
    return this.reflector.getAllAndOverride<T>(key, [ctx.getHandler(), ctx.getClass()]);
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const isPublic = this.meta<boolean>(META.public, ctx) ?? false;

    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!bearer) {
      if (isPublic) return true;
      throw unauthorized();
    }
    if (isPublic) {
      // Rotas públicas aceitam token, mas não exigem.
      req.principal = await this.authenticate(bearer).catch(() => undefined);
      return true;
    }
    const principal = await this.authenticate(bearer);
    req.principal = principal;

    const permission = this.meta<{ action: Action; resource: Resource }>(META.can, ctx);
    const adminRoute = this.meta<boolean>(META.admin, ctx) ?? false;
    const tenantRoute = this.meta<boolean>(META.tenant, ctx) ?? false;
    const optionalTenant = this.meta<boolean>(META.optionalTenant, ctx) ?? false;
    const roles = this.meta<Role[]>(META.roles, ctx) ?? [];
    const allowAdmin = this.meta<boolean>(META.allowAdmin, ctx) ?? false;
    let role: Role | null = null;

    if (adminRoute) {
      if (principal.kind !== 'admin') throw forbidden('Rota exclusiva da equipe Vetta.');
      role = principal.role;
    } else if (tenantRoute || (optionalTenant && req.headers['x-tenant-id'])) {
      if (principal.kind !== 'user')
        throw forbidden('Use a impersonação para agir dentro de um tenant.');
      const tenantId = req.headers['x-tenant-id'];
      if (typeof tenantId !== 'string' || !tenantId) {
        throw badRequest('Informe o vínculo ativo no header X-Tenant-Id.', 'TENANT_REQUIRED');
      }
      const access = await this.tenants.resolve(principal.userId, tenantId);
      req.tenantAccess = { ...access, scope: null };
      role = access.role;
    } else if (principal.kind === 'admin') {
      // Rotas de usuário comum não são para a equipe da plataforma (exceto as marcadas com @AllowAdmin).
      if (!allowAdmin) throw forbidden('Rota disponível apenas para usuários do app.');
      role = principal.role;
    }

    if (roles.length && (!role || !roles.includes(role))) throw forbidden();

    if (permission) {
      if (!role) throw forbidden();
      const scope = can(role, permission.action, permission.resource);
      if (!scope) throw forbidden();
      if (req.tenantAccess) req.tenantAccess.scope = scope;
    }

    const tenantId = req.tenantAccess?.tenantId;
    const feature = this.meta<string>(META.feature, ctx);
    if (feature && tenantId) await this.entitlements.assertFeature(tenantId, feature);
    const limit = this.meta<LimitFeatureKey>(META.limit, ctx);
    if (limit && tenantId) await this.entitlements.assertLimit(tenantId, limit);
    return true;
  }

  private async authenticate(token: string): Promise<Principal> {
    const claims = await this.tokens.verifyAccess(token);
    if (claims.typ === 'admin') {
      const admin = await this.prisma.system.adminUser.findUnique({ where: { id: claims.sub } });
      if (!admin || !admin.isActive || admin.deletedAt) throw unauthorized();
      return { kind: 'admin', adminId: admin.id, sessionId: claims.sid, role: admin.role };
    }
    return {
      kind: 'user',
      userId: claims.sub,
      sessionId: claims.sid,
      impersonatorAdminId: claims.imp ?? null,
    };
  }
}
