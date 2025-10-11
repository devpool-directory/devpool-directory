#!/usr/bin/env bash
set -euo pipefail

echo "Starting close-reason fixer"

OWNER="${GITHUB_REPOSITORY%/*}"
REPO="${GITHUB_REPOSITORY#*/}"
READ_TOKEN="${READ_TOKEN:-${GH_TOKEN:-}}"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "GITHUB_TOKEN (App token) is required for writes" >&2
  exit 1
fi
if [ -z "$READ_TOKEN" ]; then
  READ_TOKEN="$GITHUB_TOKEN"
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "Enumerating closed issues..."
CURSOR=""
: > "$TMPDIR/closed.tsv"
while : ; do
  if [ -z "$CURSOR" ]; then
    RESP=$(gh api graphql -f owner="$OWNER" -f name="$REPO" -f query='query($owner:String!,$name:String!){ repository(owner:$owner,name:$name){ issues(first:100, states:[CLOSED]){ nodes{ id number body stateReason } pageInfo{ hasNextPage endCursor } } } }')
  else
    RESP=$(gh api graphql -f owner="$OWNER" -f name="$REPO" -f cursor="$CURSOR" -f query='query($owner:String!,$name:String!,$cursor:String!){ repository(owner:$owner,name:$name){ issues(first:100, states:[CLOSED], after:$cursor){ nodes{ id number body stateReason } pageInfo{ hasNextPage endCursor } } } }')
  fi
  echo "$RESP" | jq -r '
    .data.repository.issues.nodes[] | . as $i |
    ($i.body // "") as $b |
    ($b | gsub("https://www.github.com/";"https://github.com/") | gsub("\n";" ") | gsub("\\s+$";"")) as $t |
    if ($t | test("^https://github[.]com/[^/]+/[^/]+/issues/[0-9]+$")) then
      [$i.number, $i.id, $t, ($i.stateReason//"")] | @tsv
    else empty end' >> "$TMPDIR/closed.tsv"
  HAS_NEXT=$(echo "$RESP" | jq -r '.data.repository.issues.pageInfo.hasNextPage')
  CURSOR=$(echo "$RESP" | jq -r '.data.repository.issues.pageInfo.endCursor')
  [ "$HAS_NEXT" = "true" ] || break
  sleep 0.05
done

TOTAL=$(wc -l < "$TMPDIR/closed.tsv" | tr -d ' ')
echo "Closed mirrors: $TOTAL"

UPD=0; SKIP=0; ERR=0
while IFS=$'\t' read -r NUM ID PURL CUR; do
  [ -z "$ID" ] && continue
  local_path=${PURL#https://github.com/}
  p_owner=${local_path%%/*}
  rest=${local_path#*/}
  p_repo=${rest%%/*}
  p_num=${local_path##*/}

  # Fetch partner with READ_TOKEN
  http_code=$(curl -sS -H "Accept: application/vnd.github+json" -H "Authorization: Bearer $READ_TOKEN" -o "$TMPDIR/p.json" -w "%{http_code}" "https://api.github.com/repos/$p_owner/$p_repo/issues/$p_num" || true)
  desired="NOT_PLANNED"
  if [ "$http_code" = "200" ]; then
    st=$(jq -r '.state' < "$TMPDIR/p.json")
    if [ "$st" = "closed" ]; then
      pr=$(jq -r '.state_reason // ""' < "$TMPDIR/p.json")
      case "$pr" in
        completed|COMPLETED) desired="COMPLETED" ;;
        not_planned|NOT_PLANNED|"") desired="NOT_PLANNED" ;;
        *) desired="COMPLETED" ;;
      esac
    else
      ass=$(jq -r '.assignees | length' < "$TMPDIR/p.json")
      if [ "$ass" != "0" ]; then desired="NOT_PLANNED"; else desired="NOT_PLANNED"; fi
    fi
  else
    desired="NOT_PLANNED"
  fi

  case "$CUR" in
    completed|COMPLETED) curr="COMPLETED" ;;
    not_planned|NOT_PLANNED|"") curr="NOT_PLANNED" ;;
    *) curr="NOT_PLANNED" ;;
  esac

  if [ "$curr" = "$desired" ]; then
    SKIP=$((SKIP+1))
    continue
  fi

  # Use REST patch to set state_reason on closed issue
  if gh api -X PATCH -H "Accept: application/vnd.github+json" \
       "/repos/$OWNER/$REPO/issues/$NUM" -f state=closed -f state_reason="${desired,,}" >/dev/null 2>&1; then
    echo "Updated #$NUM: $curr -> $desired"
    UPD=$((UPD+1))
  else
    echo "Failed #$NUM: $curr -> $desired" >&2
    ERR=$((ERR+1))
  fi
  sleep 0.06
done < "$TMPDIR/closed.tsv"

echo "Done. Updated=$UPD Skipped=$SKIP Errors=$ERR"

