#!/usr/bin/env bash
# live.sh — 실시간 동석 서버(temple-live)와 Postgres(temple-db)를 오라클 VM 에 올린다.
#
# usage: deploy/live.sh        (맥에서 saju_oci 키로. SSH 22번이 열린 네트워크여야 한다)
#
# VM 구성 (모두 도커 네트워크 temple-net 안, 바깥 포트 없음):
#   temple       nginx — 127.0.0.1:8091, 정적 파일 + /ws·/api 를 temple-live 로 (deploy/nginx-temple.conf)
#   temple-live  server/ (Node 22, ws + pg), 메모리 256MB 제한
#   temple-db    postgres:17, 데이터 /srv/temple/pgdata, 비밀번호·해시 소금은 /srv/temple/live.env (600, git 밖)
# 차담 스님 AI: live.env 에 OPENROUTER_API_KEY=… 를 직접 넣는다 (없으면 AI 없이 대화 나무로). 값은 이름만 넘겨 명령줄에 찍히지 않게.
# saju 운영 터널·컨테이너는 건드리지 않는다. temple 컨테이너는 처음 한 번만 다시 만든다(그때 몇 초 끊김).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VM="ubuntu@168.110.37.254"
SSH=(ssh -i "$HOME/.ssh/saju_oci" -o UserKnownHostsFile="$ROOT/deploy/oracle_known_hosts" -o StrictHostKeyChecking=yes)

rsync -az --delete --exclude node_modules -e "${SSH[*]}" "$ROOT/server/" "$VM:/srv/temple/live/"
rsync -az -e "${SSH[*]}" "$ROOT/deploy/nginx-temple.conf" "$VM:/srv/temple/nginx.conf"

"${SSH[@]}" "$VM" 'bash -s' <<'REMOTE'
set -euo pipefail
cd /srv/temple
if [ ! -f live.env ]; then
  umask 077
  printf 'POSTGRES_PASSWORD=%s\nID_SALT=%s\n' "$(openssl rand -hex 24)" "$(openssl rand -hex 24)" > live.env
fi
set -a; . ./live.env; set +a

docker network inspect temple-net >/dev/null 2>&1 || docker network create temple-net
if ! docker inspect temple-db >/dev/null 2>&1; then
  docker run -d --name temple-db --restart unless-stopped --network temple-net \
    -e POSTGRES_USER=temple -e POSTGRES_DB=temple -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    -v /srv/temple/pgdata:/var/lib/postgresql/data --memory 512m postgres:17
fi

docker build -q -t temple-live:latest live
docker rm -f temple-live >/dev/null 2>&1 || true
docker run -d --name temple-live --restart unless-stopped --network temple-net --memory 256m \
  -e DATABASE_URL="postgres://temple:${POSTGRES_PASSWORD}@temple-db:5432/temple" -e ID_SALT="$ID_SALT" \
  -e OPENROUTER_API_KEY -e MONK_MODEL -e MONK_DAILY -e MONK_DAILY_USD -e MONK_TIMEOUT_MS \
  temple-live:latest >/dev/null

# nginx: 설정 파일이 붙어 있지 않으면 한 번 다시 만든다 (temple-net 에 들어가야 temple-live 이름을 찾는다)
if docker inspect temple --format '{{range .Mounts}}{{.Destination}} {{end}}' | grep -q /etc/nginx/conf.d/default.conf; then
  docker exec temple nginx -t -q && docker exec temple nginx -s reload
else
  docker rm -f temple >/dev/null
  docker run -d --name temple --restart unless-stopped --network temple-net -p 127.0.0.1:8091:80 \
    -v /srv/temple/dist:/usr/share/nginx/html:ro -v /srv/temple/logs:/var/log/nginx \
    -v /srv/temple/nginx.conf:/etc/nginx/conf.d/default.conf:ro nginx:alpine >/dev/null
fi

for i in $(seq 1 20); do
  curl -fsS http://127.0.0.1:8091/api/health && break
  sleep 1
done
echo
docker ps --filter name=temple --format '{{.Names}}\t{{.Status}}'
REMOTE

curl -fsS -o /dev/null -w "temple.lotiony.com %{http_code}\n" https://temple.lotiony.com/
curl -fsS -w "\n" https://temple.lotiony.com/api/health
