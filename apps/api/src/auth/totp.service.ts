import { Inject, Injectable } from '@nestjs/common';
import { decryptSecret, encryptSecret, randomToken, sha256 } from '@vetta/server';
import { authenticator } from 'otplib';
import { type ApiEnv, ENV } from '../config/env';

authenticator.options = { window: 1 };

/** TOTP (RFC 6238) com segredo cifrado em repouso e códigos de recuperação de uso único. */
@Injectable()
export class TotpService {
  constructor(@Inject(ENV) private readonly env: ApiEnv) {}

  createSecret(accountName: string) {
    const secret = authenticator.generateSecret(20);
    return {
      secret,
      encrypted: encryptSecret(secret, this.env.APP_ENCRYPTION_KEY),
      otpauthUrl: authenticator.keyuri(accountName, 'Vetta', secret),
    };
  }

  verify(encryptedSecret: string | null, code: string): boolean {
    if (!encryptedSecret || !/^\d{6}$/.test(code)) return false;
    return authenticator.check(code, decryptSecret(encryptedSecret, this.env.APP_ENCRYPTION_KEY));
  }

  /** Gera 10 códigos; retorna os valores (mostrados uma vez) e os hashes (gravados). */
  recoveryCodes() {
    const codes = Array.from({ length: 10 }, () =>
      randomToken(6).replace(/[-_]/g, 'x').slice(0, 10).toUpperCase(),
    );
    return { codes, hashes: codes.map((c) => sha256(c)) };
  }

  /** Confere um código de recuperação e devolve a lista sem ele (uso único). */
  consumeRecoveryCode(hashes: string[], code: string): string[] | null {
    const h = sha256(code.trim().toUpperCase());
    return hashes.includes(h) ? hashes.filter((x) => x !== h) : null;
  }

  /** Para testes e2e: gera o código atual a partir do segredo em claro. */
  static currentCode(secret: string): string {
    return authenticator.generate(secret);
  }
}
