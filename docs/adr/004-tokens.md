# ADR-004 — Access JWT + refresh opaco rotativo

**Status:** aceito (Fase 0)

## Decisão

- **Access token:** JWT HS256 de 15 min com `sub`, `sid` (sessão), `typ` (`user` ou `admin`) e `imp` (admin que está impersonando). Ao revogar uma sessão, a chave `revoked:sid:*` no Redis bloqueia os access tokens já emitidos.
- **Refresh token:** 32 bytes aleatórios. Só o hash SHA-256 fica em `refresh_tokens`. Cada token vale uma vez (claim atômico).
- **Reuso:** apresentar um token já rotacionado revoga a sessão inteira, emite `auth.refresh_token_reused` (e-mail e in-app) e responde 401 `TOKEN_REUSED`.
- **Sessões:** uma por dispositivo, listáveis e revogáveis. As de impersonação têm prazo fixo e não aparecem para o usuário.
- **Web na Fase 0:** guarda os tokens no `localStorage`. Pendência: BFF com cookie httpOnly.
