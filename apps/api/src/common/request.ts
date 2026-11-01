import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { PlatformRole, Scope, TenantRole } from '@vetta/contracts';
import type { Request } from 'express';
import { forbidden, unauthorized } from './errors';

export interface UserPrincipal {
  kind: 'user';
  userId: string;
  sessionId: string;
  impersonatorAdminId: string | null;
}

export interface AdminPrincipal {
  kind: 'admin';
  adminId: string;
  sessionId: string;
  role: PlatformRole;
}

export type Principal = UserPrincipal | AdminPrincipal;

/** Tenant ativo da requisição (X-Tenant-Id validado contra os vínculos do usuário). */
export interface TenantAccess {
  tenantId: string;
  role: TenantRole;
  memberId: string | null;
  studentLinkId: string | null;
  /** Escopo concedido por can() para a ação da rota. */
  scope: Scope | null;
}

export interface AppRequest extends Request {
  principal?: Principal;
  tenantAccess?: TenantAccess;
}

export const CurrentPrincipal = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const p = ctx.switchToHttp().getRequest<AppRequest>().principal;
  if (!p) throw unauthorized();
  return p;
});

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): UserPrincipal => {
    const p = ctx.switchToHttp().getRequest<AppRequest>().principal;
    if (!p) throw unauthorized();
    if (p.kind !== 'user') throw forbidden('Rota disponível apenas para usuários do app.');
    return p;
  },
);

export const CurrentAdmin = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AdminPrincipal => {
    const p = ctx.switchToHttp().getRequest<AppRequest>().principal;
    if (!p) throw unauthorized();
    if (p.kind !== 'admin') throw forbidden('Rota disponível apenas para a equipe Vetta.');
    return p;
  },
);

export const CurrentTenant = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): TenantAccess => {
    const t = ctx.switchToHttp().getRequest<AppRequest>().tenantAccess;
    if (!t) throw forbidden('Selecione um vínculo (X-Tenant-Id).');
    return t;
  },
);

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export const Meta = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestMeta => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  return {
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent']?.slice(0, 500) ?? null,
    requestId: req.id ? String(req.id) : null,
  };
});
