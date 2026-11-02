# ADR-006 — Pacote `packages/server`

**Status:** aceito (Fase 0)

A API e o worker compartilham código de backend:

- schemas de env;
- providers de storage, vídeo, e-mail, push e WhatsApp/SMS;
- regras e motor de notificações, pipeline de mídia e jobs;
- cálculo de entitlements.

Para não duplicar nem importar código de um app no outro, criamos `packages/server`, além da lista do CLAUDE.md §7. Ele é CommonJS (como `packages/db`) e não depende do NestJS.
