#!/usr/bin/env bash
set -euo pipefail

# Deletes directory issues that are not perfect mirrors of their partner issues.
# Perfect mirror criteria:
# - body is exactly "https://github.com/<owner>/<repo>/issues/<num>" (no www, no whitespace)
# - title equals partner title
# - label set (names) equals partner label names exactly
# - state matches partner state; if closed, state_reason matches partner state_reason
# - author is devpool-directory-superintendent (bot)

log() { printf '%s %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"; }

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "GITHUB_TOKEN is not set" >&2
  exit 1
fi
export GH_TOKEN="$GITHUB_TOKEN"

remote_url=$(git config --get remote.origin.url || true)
OWNER=$(printf '%s' "$remote_url" | sed -E 's#.*github.com[:/ ]([^/]+)/([^/.]+)(\\.git)?$#\1#')
REPO=$(printf '%s' "$remote_url" | sed -E 's#.*github.com[:/ ]([^/]+)/([^/.]+)(\\.git)?$#\2#')
[ -n "$OWNER" ] && [ -n "$REPO" ] || { echo "Could not detect owner/repo" >&2; exit 1; }

LOG_DIR=".cache/prune-imperfect"
mkdir -p "$LOG_DIR"
out="$LOG_DIR/results-$(date -u +%Y%m%dT%H%M%SZ).tsv"
echo -e "number\treason\tpartner_url" > "$out"

deleted=0; kept=0; failed=0
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

cursor=""
while : ; do
  if [ -z "$cursor" ]; then
    resp=$(gh api graphql -f owner="$OWNER" -f name="$REPO" -f query='query($owner:String!,$name:String!){ repository(owner:$owner,name:$name){ issues(first:100, states:[OPEN,CLOSED]){ nodes{ id number title body state stateReason author{ login } labels(first:100){ nodes{ name } } } pageInfo{ hasNextPage endCursor } } } }')
  else
    resp=$(gh api graphql -f owner="$OWNER" -f name="$REPO" -f cursor="$cursor" -f query='query($owner:String!,$name:String!,$cursor:String!){ repository(owner:$owner,name:$name){ issues(first:100, after:$cursor, states:[OPEN,CLOSED]){ nodes{ id number title body state stateReason author{ login } labels(first:100){ nodes{ name } } } pageInfo{ hasNextPage endCursor } } } }')
  fi
  has_next=$(echo "$resp" | jq -r '.data.repository.issues.pageInfo.hasNextPage')
  cursor=$(echo "$resp" | jq -r '.data.repository.issues.pageInfo.endCursor')
  jq -c '.data.repository.issues.nodes[]' <<<"$resp" > "$tmpdir/nodes.jsonl"
  while IFS= read -r row; do
    id=$(jq -r '.id' <<<"$row")
    num=$(jq -r '.number' <<<"$row")
    title=$(jq -r '.title' <<<"$row")
    body=$(jq -r '.body // ""' <<<"$row")
    state=$(jq -r '.state' <<<"$row")
    reason=$(jq -r '.stateReason // ""' <<<"$row")
    author=$(jq -r '.author.login // ""' <<<"$row")
    labels=$(jq -r '.labels.nodes[]?.name' <<<"$row" | sort | tr '\n' ',' | sed 's/,$//')
    bnorm=$(printf '%s' "$body" | sed -e 's#https://www.github.com/#https://github.com/#' -e 's/[[:space:]]*$//')

    # Body must be exact GitHub issue URL
    if ! echo "$bnorm" | grep -qE '^https://github[.]com/[^/]+/[^/]+/issues/[0-9]+$'; then
      echo -e "$num\tbody_not_url\t$bnorm" >> "$out"; \
      if gh api graphql -f query='mutation($id:ID!){ deleteIssue(input:{issueId:$id}){ clientMutationId } }' -F id="$id" >/dev/null 2>&1; then deleted=$((deleted+1)); else failed=$((failed+1)); fi; \
      continue
    fi
    p_owner=$(echo "$bnorm" | awk -F/ '{print $4}')
    p_repo=$(echo "$bnorm" | awk -F/ '{print $5}')
    p_num=$(echo "$bnorm" | awk -F/ '{print $7}')
    # Fetch partner
    http=$(curl -sS -H "Accept: application/vnd.github+json" -H "Authorization: Bearer $GITHUB_TOKEN" -o "$LOG_DIR/p.json" -w "%{http_code}" "https://api.github.com/repos/$p_owner/$p_repo/issues/$p_num" || true)
    if [ "$http" != "200" ]; then
      echo -e "$num\tpartner_${http}\t$bnorm" >> "$out"; \
      if gh api graphql -f query='mutation($id:ID!){ deleteIssue(input:{issueId:$id}){ clientMutationId } }' -F id="$id" >/dev/null 2>&1; then deleted=$((deleted+1)); else failed=$((failed+1)); fi; \
      continue
    fi
    p_title=$(jq -r '.title // ""' < "$LOG_DIR/p.json")
    p_state=$(jq -r '.state // ""' < "$LOG_DIR/p.json")
    p_reason=$(jq -r '.state_reason // ""' < "$LOG_DIR/p.json")
    p_labels=$(jq -r '.labels[]?.name' < "$LOG_DIR/p.json" | sort | tr '\n' ',' | sed 's/,$//')
    # Normalize reasons for compare
    dir_reason=$(printf '%s' "$reason" | tr '[:upper:]' '[:lower:]')
    # Compare checks
    mismatch=""
    [ "$author" = "devpool-directory-superintendent" ] || [ "$author" = "devpool-directory-superintendent[bot]" ] || mismatch="author"
    [ -z "$mismatch" ] && [ "$title" = "$p_title" ] || mismatch="title"
    [ -z "$mismatch" ] && { [ "$state" = "OPEN" ] && [ "$p_state" = "open" ] || [ "$state" = "CLOSED" ] && [ "$p_state" = "closed" ]; } || mismatch="state"
    if [ -z "$mismatch" ] && [ "$p_state" = "closed" ]; then
      [ "$dir_reason" = "$p_reason" ] || mismatch="reason"
    fi
    [ -z "$mismatch" ] && [ "$labels" = "$p_labels" ] || mismatch=${mismatch:-labels}

    if [ -n "$mismatch" ]; then
      echo -e "$num\t$mismatch\t$bnorm" >> "$out"
      if gh api graphql -f query='mutation($id:ID!){ deleteIssue(input:{issueId:$id}){ clientMutationId } }' -F id="$id" >/dev/null 2>&1; then
        deleted=$((deleted+1))
      else
        failed=$((failed+1))
      fi
    else
      kept=$((kept+1))
    fi
  done < "$tmpdir/nodes.jsonl"
  [ "$has_next" = "true" ] || break
  sleep 0.05
done

log "Prune summary: deleted=$deleted kept=$kept failed=$failed (report: $out)"
