# ADR-003 — Prisma 6.19 em vez do 7

**Status:** aceito (Fase 0)

O Prisma 7 exige driver adapters e gera um cliente TypeScript/ESM, o que pede ajustes no NestJS (CommonJS) e no worker. O Prisma 6.19 é estável, já usa `prisma.config.ts` e suporta schema multi-arquivo e `uuid(7)`.

A migração para o 7 fica planejada para depois das fases de produto.
