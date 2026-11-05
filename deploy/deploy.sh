#!/usr/bin/env bash
# deploy.sh — push web/ to the Oracle VM (saju-a1), served at https://temple.lotiony.com
#
# usage: deploy/deploy.sh          # stage web/ + rsync (nginx serves the new files immediately)
#        deploy/deploy.sh setup    # first time only: start the nginx container on the VM
#
# VM layout: /srv/temple/dist (static files) · /srv/temple/logs (nginx logs)
# nginx listens on 127.0.0.1:8091 only; outside traffic comes through the saju-oracle cloudflared tunnel
# (ingress rule for temple.lotiony.com in /srv/saju/deploy/cloudflared/config.yml).
# CI (.github/workflows/deploy.yml) uses the same rsync with TEMPLE_DEPLOY_KEY, a key locked to rrsync /srv/temple/dist.
# macOS /usr/bin/rsync (openrsync) is refused by rrsync — on the Mac, deploy with the default saju_oci key.
#
# Cache busting: Cloudflare caches .js/.css for 4h but never index.html, so web/src/ is published as
# v/<rev>/ and index.html is rewritten to point there. Upload is two-phase — v/<rev>/ first, then the
# page — so the live index.html never points at modules that are not there yet. Old v/ dirs are kept
# (excluded from --delete) so a page that loaded the previous index.html still finds its modules.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VM="ubuntu@168.110.37.254"
KEY="${TEMPLE_DEPLOY_KEY:-$HOME/.ssh/saju_oci}"
SSH=(ssh -i "$KEY" -o UserKnownHostsFile="$ROOT/deploy/oracle_known_hosts" -o StrictHostKeyChecking=yes)

if [ "${1:-}" = "setup" ]; then
  "${SSH[@]}" "$VM" 'sudo mkdir -p /srv/temple/dist /srv/temple/logs && sudo chown -R ubuntu: /srv/temple &&
    docker run -d --name temple --restart unless-stopped -p 127.0.0.1:8091:80 \
      -v /srv/temple/dist:/usr/share/nginx/html:ro -v /srv/temple/logs:/var/log/nginx nginx:alpine'
  exit 0
fi

REV="$(git -C "$ROOT" rev-parse --short=10 HEAD)"
git -C "$ROOT" diff --quiet HEAD -- web server/moderation.js || REV="$REV-dirty$(date +%s)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
# mktemp -d 는 700 으로 만든다 — 그대로 올리면 rsync 가 서버 사이트 루트도 700 으로 바꿔 nginx 가 403 을 낸다
chmod 755 "$STAGE"
mkdir -p "$STAGE/v"
# -L: web/src/core/moderation.js 는 server/moderation.js 로 가는 링크 — 실제 파일로 올린다 (서버·화면 공용 거름)
rsync -aL --exclude .DS_Store --exclude "*.test.js" "$ROOT/web/src/" "$STAGE/v/$REV/"
sed "s#\./src/#./v/$REV/#g" "$ROOT/web/index.html" > "$STAGE/index.html"
# 녹음 등 큰 정적 파일은 버전 경로 밖 assets/ 에 둔다 (매 배포마다 다시 올리지 않게). 바꿀 땐 파일명을 바꿀 것.
[ -d "$ROOT/web/assets" ] && rsync -a --exclude .DS_Store "$ROOT/web/assets/" "$STAGE/assets/"
grep -q "v/$REV/main.js" "$STAGE/index.html"

# With the CI key the remote path is relative to /srv/temple/dist (rrsync); with saju_oci it is absolute.
DEST="${TEMPLE_DEPLOY_KEY:+./}"
DEST="${DEST:-/srv/temple/dist/}"
DRY="${DEPLOY_DRY_RUN:+-n}"
rsync -az --chmod=D755,F644 $DRY -e "${SSH[*]}" "$STAGE/v/" "$VM:${DEST}v/"
[ -d "$STAGE/assets" ] && rsync -az --chmod=D755,F644 $DRY -e "${SSH[*]}" "$STAGE/assets/" "$VM:${DEST}assets/"
rsync -az --chmod=D755,F644 $DRY --delete --exclude 'v/' -e "${SSH[*]}" "$STAGE/" "$VM:$DEST"
[ -n "$DRY" ] && { echo "dry run: staged $STAGE"; exit 0; }
curl -fsS -o /dev/null -w "temple.lotiony.com %{http_code}\n" https://temple.lotiony.com/
curl -fsS -o /dev/null -w "v/$REV/main.js %{http_code}\n" "https://temple.lotiony.com/v/$REV/main.js"
