#!/usr/bin/env bash
# Prepara a homologação na VPS (idempotente): gera segredos na primeira vez, builda a
# imagem, sobe os serviços e instala o site no nginx do host sem tocar nos demais.
set -euo pipefail
cd "$(dirname "$0")"

DOMAIN=vettafit.com.br
ENV_FILE=.env.homolog

if [ ! -f "$ENV_FILE" ]; then
  rnd() { openssl rand -hex "$1"; }
  PG_PASS=$(rnd 16); S3_KEY=vetta$(rnd 4); S3_SECRET=$(rnd 20)
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
LOG_LEVEL=info
POSTGRES_PASSWORD=$PG_PASS
DATABASE_URL=postgresql://vetta:$PG_PASS@postgres:5432/vetta?schema=public
REDIS_URL=redis://redis:6379
APP_ENCRYPTION_KEY=$(openssl rand -base64 32)
JWT_ACCESS_SECRET=$(rnd 32)
APP_WEB_URL=https://app.$DOMAIN
APP_ADMIN_URL=https://admin.$DOMAIN
APP_SITE_URL=https://$DOMAIN
APP_API_URL=https://api.$DOMAIN
TRUST_PROXY=true
S3_ENDPOINT=http://s3:9000
S3_PUBLIC_ENDPOINT=https://cdn.$DOMAIN
S3_REGION=auto
S3_BUCKET=vetta-media
S3_ACCESS_KEY_ID=$S3_KEY
S3_SECRET_ACCESS_KEY=$S3_SECRET
S3_FORCE_PATH_STYLE=true
EMAIL_PROVIDER=smtp
SMTP_URL=smtp://mailpit:1025
EMAIL_FROM="Vetta <nao-responda@$DOMAIN>"
CLAMAV_ENABLED=true
CLAMAV_HOST=clamav
CLAMAV_PORT=3310
API_URL=http://api:4000
RUN_DEV_SEED=true
SEED_PASSWORD="$(rnd 6)Aa1"
SWAGGER_ENABLED=false
EOF
  chmod 600 "$ENV_FILE"
  echo "Segredos gerados em deploy/$ENV_FILE"
fi
set -a; . "./$ENV_FILE"; set +a

# Storage: credencial e CORS para upload direto do navegador.
cat > s3.json <<EOF
{"identities":[{"name":"vetta","credentials":[{"accessKey":"$S3_ACCESS_KEY_ID","secretKey":"$S3_SECRET_ACCESS_KEY"}],"actions":["Admin","Read","List","Tagging","Write"]}]}
EOF
cat > s3-cors.json <<EOF
{"CORSRules":[{"AllowedOrigins":["https://app.$DOMAIN","https://admin.$DOMAIN","https://$DOMAIN"],"AllowedMethods":["GET","PUT","POST","HEAD"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3000}]}
EOF

docker build -t vetta-app:homolog \
  --build-arg NEXT_PUBLIC_API_URL="https://api.$DOMAIN" \
  --build-arg NEXT_PUBLIC_APP_URL="https://app.$DOMAIN" \
  --build-arg NEXT_PUBLIC_WEB_URL="https://app.$DOMAIN" \
  --build-arg NEXT_PUBLIC_SITE_URL="https://$DOMAIN" \
  ..

docker compose -f docker-compose.homolog.yml --env-file "$ENV_FILE" up -d

# nginx do host: só adiciona o arquivo do Vetta e valida antes de recarregar.
# Só na primeira vez: depois o certbot edita o arquivo (HTTPS) e ele não pode ser sobrescrito.
if [ -d /etc/nginx/sites-available ] && [ ! -f /etc/nginx/sites-available/vetta-homolog ]; then
  cp nginx/vetta-homolog.conf /etc/nginx/sites-available/vetta-homolog
  ln -sf /etc/nginx/sites-available/vetta-homolog /etc/nginx/sites-enabled/vetta-homolog
  nginx -t && systemctl reload nginx
fi
docker compose -f docker-compose.homolog.yml --env-file "$ENV_FILE" ps
