# ADR-008 — SeaweedFS no lugar do MinIO no ambiente local

**Status:** aceito (Fase 0). Desvio do CLAUDE.md §6, que pede MinIO.

## Contexto

Em 2025 a MinIO deixou de publicar imagens públicas: `minio/minio` e `minio/mc` não existem mais no Docker Hub, e o quay.io exige autenticação.

## Decisão

Usar SeaweedFS (Apache 2.0), compatível com a API S3 (URLs pré-assinadas, multipart e CORS), no compose e nos testes. A aplicação só fala S3 (`S3StorageProvider`). Em produção continua o Cloudflare R2, sem mudança de código.

## Alternativas

- RustFS: compatível com MinIO, porém mais novo.
- Build do MinIO a partir do código-fonte: custo de manutenção.
- LocalStack: pesado.
