import { Inject, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { type ApiEnv, ENV } from '../config/env';
import { unauthorized } from '../common/errors';

export interface OAuthIdentity {
  provider: 'GOOGLE' | 'APPLE';
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

const PROVIDERS = {
  GOOGLE: {
    jwks: 'https://www.googleapis.com/oauth2/v3/certs',
    issuers: ['https://accounts.google.com', 'accounts.google.com'],
  },
  APPLE: { jwks: 'https://appleid.apple.com/auth/keys', issuers: ['https://appleid.apple.com'] },
} as const;

/** Valida ID tokens do Google e da Apple pelas chaves públicas (JWKS) de cada provedor. */
@Injectable()
export class OAuthService {
  private readonly jwks = new Map<string, JWTVerifyGetKey>();

  constructor(@Inject(ENV) private readonly env: ApiEnv) {}

  async verify(provider: 'GOOGLE' | 'APPLE', idToken: string): Promise<OAuthIdentity> {
    const audience = provider === 'GOOGLE' ? this.env.GOOGLE_CLIENT_IDS : this.env.APPLE_CLIENT_IDS;
    if (!audience.length)
      throw unauthorized(
        `Login com ${provider === 'GOOGLE' ? 'Google' : 'Apple'} não configurado.`,
      );
    const cfg = PROVIDERS[provider];
    let keys = this.jwks.get(provider);
    if (!keys) {
      keys = createRemoteJWKSet(new URL(cfg.jwks));
      this.jwks.set(provider, keys);
    }
    try {
      const { payload } = await jwtVerify(idToken, keys, { issuer: [...cfg.issuers], audience });
      const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
      return {
        provider,
        subject: String(payload.sub),
        email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
        emailVerified,
        name: typeof payload.name === 'string' ? payload.name : null,
      };
    } catch {
      throw unauthorized('Não foi possível validar o login social.', 'TOKEN_INVALID');
    }
  }
}
