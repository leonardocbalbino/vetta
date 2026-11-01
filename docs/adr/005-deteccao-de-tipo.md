# ADR-005 — Detecção de tipo própria (magic number)

**Status:** aceito (Fase 0)

O pacote `file-type` é ESM-only e cobre muito mais formatos do que aceitamos.

Implementamos `detectMime` (packages/server/src/media/magic.ts) só para os formatos dos purposes: JPEG, PNG, GIF, WEBP, HEIC/HEIF, MP4/MOV, áudio, PDF, EPUB e SVG. A função tem testes.

O tipo detectado precisa bater com o declarado e com a lista do purpose. Assim, extensão falsa resulta em `FAILED`, o objeto é apagado e a cota é liberada.
