# ADR-009 — Versões fixadas na Fase 0

**Status:** aceito

| Item       | Versão                                        | Motivo                                                                                         |
| ---------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| TypeScript | 5.9 (6.0 no app mobile, exigido pelo Expo 58) | O TS 7 (nativo) ainda não é suportado pelo Next 15 e pelo typescript-eslint                    |
| NestJS     | 11                                            | Exigido pelo CLAUDE.md (a 12 já existe)                                                        |
| Next.js    | 15.5                                          | Exigido pelo CLAUDE.md (a 16 já existe)                                                        |
| Expo       | SDK 58 (atual)                                | `expo-av` foi descontinuado: usamos `expo-video`; áudio do chat com `expo-audio` na fase dele  |
| ESLint     | 9 (flat config)                               | A linha 9 está marcada como deprecated; migrar para a 10 quando os plugins de React suportarem |
| Vitest     | 3 · BullMQ 5 · ioredis 5                      | Majors estáveis conhecidas; atualizar com a suíte verde                                        |
