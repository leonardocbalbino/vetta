#!/usr/bin/env bash
# Instalado na VPS em /usr/local/bin/vetta-deploy e preso à chave de deploy do GitHub
# (command= no authorized_keys): a chave só consegue rodar este script.
# Recebe o código (tar do git archive) pela entrada padrão, troca o código em /opt/vetta
# e roda o setup da homologação (build da imagem, migrations e reinício dos serviços).
set -euo pipefail
exec 9>/var/lock/vetta-deploy.lock
flock -w 1800 9 # um deploy por vez

RELEASE=/opt/vetta-releases/$(date +%Y%m%d%H%M%S)
mkdir -p "$RELEASE"
tar -x -C "$RELEASE"

# O .env.homolog, s3.json e afins ficam em /opt/vetta/deploy e não vêm no tar.
rsync -a --delete \
  --exclude 'deploy/.env.homolog' --exclude 'deploy/s3.json' --exclude 'deploy/s3-cors.json' \
  --exclude 'deploy/setup.log' \
  "$RELEASE"/ /opt/vetta/
cd /opt/vetta/deploy
bash ./setup-homolog.sh 2>&1 | tee setup.log | tail -25

# Saúde depois do deploy.
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8610/health >/dev/null; then echo "API saudável"; break; fi
  sleep 4
done
curl -fsS http://127.0.0.1:8610/health >/dev/null || { echo "API não respondeu"; exit 1; }

# Guarda só as 5 últimas versões recebidas.
ls -1dt /opt/vetta-releases/* | tail -n +6 | xargs -r rm -rf
