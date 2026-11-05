#!/usr/bin/env bash
# mod.sh — 실서버 공유 서원(연등·기와·돌탑) 관리. 맥에서 saju_oci 키로 VM 의 temple-db 에 붙는다.
#
#   deploy/mod.sh list [lanterns|tiles|stones] [n]   최근 글 (숨긴 것 포함, 기본 stones 30개)
#   deploy/mod.sh find <글자>                        세 종류에서 글·작성자에 글자가 든 것
#   deploy/mod.sh reports [n]                        신고가 많은 글
#   deploy/mod.sh hide <id> | unhide <id>            숨기기 / 되살리기 (지우지 않는다)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VM="ubuntu@168.110.37.254"
SSH=(ssh -i "$HOME/.ssh/saju_oci" -o UserKnownHostsFile="$ROOT/deploy/oracle_known_hosts" -o StrictHostKeyChecking=yes)

# 값은 psql 변수(:'v')로만 넘긴다 — SQL 에 직접 끼워 넣지 않는다
psql_run() {
  local sql="$1"; shift
  local vars=()
  for kv in "$@"; do vars+=("-v" "$(printf '%q' "$kv")"); done
  printf '%s\n' "$sql" | "${SSH[@]}" "$VM" "docker exec -i temple-db psql -U temple -d temple -X -q -P pager=off ${vars[*]:-}"
}

table_of() {
  case "$1" in
    l_*) echo lanterns ;; t_*) echo tiles ;; s_*) echo stones ;;
    *) echo "id 는 l_ / t_ / s_ 로 시작해야 합니다: $1" >&2; exit 1 ;;
  esac
}

cmd="${1:-}"
case "$cmd" in
  list)
    t="${2:-stones}"; n="${3:-30}"
    case "$t" in lanterns|tiles|stones) ;; *) echo "종류: lanterns | tiles | stones" >&2; exit 1 ;; esac
    [[ "$n" =~ ^[0-9]+$ ]] || { echo "n 은 숫자" >&2; exit 1; }
    psql_run "SELECT id, author, wish, hidden, created_at FROM $t ORDER BY created_at DESC LIMIT $n;"
    ;;
  find)
    [ -n "${2:-}" ] || { echo "찾을 글자를 주세요" >&2; exit 1; }
    psql_run "SELECT 'lanterns' AS kind, id, author, wish, hidden FROM lanterns WHERE wish ILIKE '%' || :'q' || '%' OR author ILIKE '%' || :'q' || '%'
UNION ALL SELECT 'tiles', id, author, wish, hidden FROM tiles WHERE wish ILIKE '%' || :'q' || '%' OR author ILIKE '%' || :'q' || '%'
UNION ALL SELECT 'stones', id, author, wish, hidden FROM stones WHERE wish ILIKE '%' || :'q' || '%' OR author ILIKE '%' || :'q' || '%';" "q=$2"
    ;;
  reports)
    n="${2:-20}"; [[ "$n" =~ ^[0-9]+$ ]] || { echo "n 은 숫자" >&2; exit 1; }
    psql_run "SELECT kind, item_id, count(*) AS reports, max(created_at) AS last FROM reports GROUP BY kind, item_id ORDER BY reports DESC, last DESC LIMIT $n;"
    ;;
  hide|unhide)
    [ -n "${2:-}" ] || { echo "id 를 주세요" >&2; exit 1; }
    t="$(table_of "$2")"; v=$([ "$cmd" = hide ] && echo true || echo false)
    psql_run "UPDATE $t SET hidden = $v WHERE id = :'id' RETURNING id, wish, hidden;" "id=$2"
    ;;
  *)
    sed -n '2,8p' "$0"; exit 1 ;;
esac
