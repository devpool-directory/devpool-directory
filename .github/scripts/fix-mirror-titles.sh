#!/usr/bin/env bash
set -euo pipefail

echo "Starting mirror title normalization"

OWNER="${GITHUB_REPOSITORY%/*}"
REPO="${GITHUB_REPOSITORY#*/}"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "GITHUB_TOKEN (App token) is required for writes" >&2
  exit 1
fi

READ_TOKEN="${READ_TOKEN:-${GH_TOKEN:-$GITHUB_TOKEN}}"

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

echo "Enumerating directory issues..."
: > "$tmpdir/issues.tsv"
cursor=""
while : ; do
  if [ -z "$cursor" ]; then
    resp=$(gh api graphql -f owner="$OWNER" -f name="$REPO" -f query='query($owner:String!,$name:String!){ repository(owner:$owner,name:$name){ issues(first:100, states:[OPEN,CLOSED]){ nodes{ number title body } pageInfo{ hasNextPage endCursor } } } }')
  else
    resp=$(gh api graphql -f owner="$OWNER" -f name="$REPO" -f cursor="$cursor" -f query='query($owner:String!,$name:String!,$cursor:String!){ repository(owner:$owner,name:$name){ issues(first:100, after:$cursor, states:[OPEN,CLOSED]){ nodes{ number title body } pageInfo{ hasNextPage endCursor } } } }')
  fi
  echo "$resp" | jq -r '
    .data.repository.issues.nodes[] | . as $i |
    ($i.body // "") as $b |
    ($b | gsub("https://www.github.com/";"https://github.com/") | gsub("\n";" ") | gsub("\r";"") | gsub("[[:space:]]+$";"")) as $bodyNorm |
    [$i.number, ($i.title//""), $bodyNorm] | @tsv' >> "$tmpdir/issues.tsv"
  has_next=$(echo "$resp" | jq -r '.data.repository.issues.pageInfo.hasNextPage')
  cursor=$(echo "$resp" | jq -r '.data.repository.issues.pageInfo.endCursor')
  [ "$has_next" = "true" ] || break
  sleep 0.05
done

updated=0
skipped=0
failed=0

while IFS=$'\t' read -r NUM TITLE_CUR BODY; do
  [ -z "$NUM" ] && continue
  PURL=$(printf '%s' "$BODY" | sed -e 's#https://www.github.com/#https://github.com/#' -e 's/[[:space:]]*$//')
  if ! echo "$PURL" | grep -qE '^https://github[.]com/[^/]+/[^/]+/issues/[0-9]+$'; then
    skipped=$((skipped+1)); continue
  fi
  POWNER=$(echo "$PURL" | awk -F/ '{print $4}')
  PREPO=$(echo "$PURL" | awk -F/ '{print $5}')
  PNUM=$(echo "$PURL" | awk -F/ '{print $7}')
  http=$(curl -sS -H "Accept: application/vnd.github+json" -H "Authorization: Bearer $READ_TOKEN" -o "$tmpdir/p.json" -w "%{http_code}" "https://api.github.com/repos/$POWNER/$PREPO/issues/$PNUM" || true)
  if [ "$http" != "200" ]; then skipped=$((skipped+1)); continue; fi
  PARTNER_TITLE=$(jq -r '.title // ""' < "$tmpdir/p.json")
  rm -f "$tmpdir/p.json"
  if [ -z "$PARTNER_TITLE" ] || [ "$TITLE_CUR" = "$PARTNER_TITLE" ]; then
    skipped=$((skipped+1)); continue
  fi
  desired=$(printf '%s' "$PARTNER_TITLE" | tr -d '\r' | head -c 240)
  if gh api -X PATCH \
       "/repos/$OWNER/$REPO/issues/$NUM" -f title="$desired" >/dev/null 2>&1; then
    echo "Updated #$NUM"
    updated=$((updated+1))
  else
    echo "Failed to update #$NUM" >&2
    failed=$((failed+1))
  fi
  sleep 0.06
done < "$tmpdir/issues.tsv"

echo "Done. updated=$updated skipped=$skipped failed=$failed"
