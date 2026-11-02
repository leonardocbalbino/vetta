import { CreateBucketCommand, PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

/**
 * Infra dos testes e2e. No CI os serviços vêm por variáveis (TEST_DATABASE_URL,
 * TEST_REDIS_URL, TEST_S3_ENDPOINT); localmente sobem via Testcontainers.
 */
const started: StartedTestContainer[] = [];

export const TEST_S3 = {
  accessKeyId: 'vetta',
  secretAccessKey: 'vetta-s3-secret',
  bucket: 'vetta-test',
};

const S3_CONFIG = JSON.stringify({
  identities: [
    {
      name: 'vetta',
      credentials: [{ accessKey: TEST_S3.accessKeyId, secretKey: TEST_S3.secretAccessKey }],
      actions: ['Admin', 'Read', 'List', 'Tagging', 'Write'],
    },
  ],
});

export async function setup() {
  if (!process.env.TEST_DATABASE_URL) {
    const pg = await new GenericContainer('postgres:16-alpine')
      .withEnvironment({ POSTGRES_USER: 'vetta', POSTGRES_PASSWORD: 'vetta', POSTGRES_DB: 'vetta' })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();
    started.push(pg);
    process.env.TEST_DATABASE_URL = `postgresql://vetta:vetta@${pg.getHost()}:${pg.getMappedPort(5432)}/vetta`;
  }
  if (!process.env.TEST_REDIS_URL) {
    const redis = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
    started.push(redis);
    process.env.TEST_REDIS_URL = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  }
  if (!process.env.TEST_S3_ENDPOINT) {
    const s3 = await new GenericContainer('chrislusf/seaweedfs:latest')
      .withCommand([
        'server',
        '-dir=/data',
        '-s3',
        '-s3.port=9000',
        '-s3.config=/etc/seaweedfs/s3.json',
      ])
      .withCopyContentToContainer([{ content: S3_CONFIG, target: '/etc/seaweedfs/s3.json' }])
      .withExposedPorts(9000)
      .withWaitStrategy(Wait.forHttp('/healthz', 9000).forStatusCode(200))
      .withStartupTimeout(120_000)
      .start();
    started.push(s3);
    process.env.TEST_S3_ENDPOINT = `http://${s3.getHost()}:${s3.getMappedPort(9000)}`;
  }

  const client = new S3Client({
    endpoint: process.env.TEST_S3_ENDPOINT,
    region: 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId: TEST_S3.accessKeyId, secretAccessKey: TEST_S3.secretAccessKey },
  });
  await client.send(new CreateBucketCommand({ Bucket: TEST_S3.bucket })).catch(() => undefined);
  await client
    .send(
      new PutBucketCorsCommand({
        Bucket: TEST_S3.bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: ['*'],
              AllowedMethods: ['GET', 'PUT', 'HEAD'],
              AllowedHeaders: ['*'],
              ExposeHeaders: ['ETag'],
            },
          ],
        },
      }),
    )
    .catch(() => undefined);
}

export async function teardown() {
  await Promise.allSettled(started.map((c) => c.stop()));
}
