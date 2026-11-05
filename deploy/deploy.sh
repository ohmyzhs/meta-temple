#!/usr/bin/env bash
# deploy.sh — push the static site to the Oracle VM (saju-a1), served at https://temple.lotiony.com
#
# usage: deploy/deploy.sh          # rsync index.html + src/ (nginx serves the new files immediately)
#        deploy/deploy.sh setup    # first time only: start the nginx container on the VM
#
# VM layout: /srv/temple/dist (static files) · /srv/temple/logs (nginx logs)
# nginx listens on 127.0.0.1:8091 only; outside traffic comes through the saju-oracle cloudflared tunnel
# (ingress rule for temple.lotiony.com in /srv/saju/deploy/cloudflared/config.yml).
# CI (.github/workflows/deploy.yml) uses the same rsync with TEMPLE_DEPLOY_KEY, a key locked to rrsync /srv/temple/dist.
# macOS /usr/bin/rsync (openrsync) is refused by rrsync — on the Mac, deploy with the default saju_oci key.
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

# Only the site itself — docs/, README, package.json stay private.
# With the CI key the remote path is relative to /srv/temple/dist (rrsync); with saju_oci it is absolute.
DEST="${TEMPLE_DEPLOY_KEY:+./}"
DEST="${DEST:-/srv/temple/dist/}"
cd "$ROOT"
rsync -az --delete --exclude .DS_Store -e "${SSH[*]}" index.html src "$VM:$DEST"
curl -fsS -o /dev/null -w "temple.lotiony.com %{http_code}\n" https://temple.lotiony.com/
