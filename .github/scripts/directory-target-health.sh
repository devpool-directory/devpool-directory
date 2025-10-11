#!/usr/bin/env bash
set -euo pipefail

echo "Starting Directory Target Health job"

# Resolve owner/repo according to trigger
OWNER="${INPUT_OWNER:-}"
REPO="${INPUT_REPO:-}"
if [ -z "$OWNER" ] || [ -z "$REPO" ]; then
  OWNER="${GITHUB_REPOSITORY%/*}"
  REPO="${GITHUB_REPOSITORY#*/}"
fi
echo "Target repo: $OWNER/$REPO"

# Resolve mode and dry-run
MODE="${INPUT_MODE:-delete_then_label}"
DRY_RUN="${INPUT_DRY_RUN:-true}"
MAX_TO_PROCESS="${INPUT_MAX:-}"
CONCURRENCY="${INPUT_CONCURRENCY:-10}"
UNKNOWN_ACTION="${INPUT_UNKNOWN_ACTION:-label_only}"
IGNORE_BOTS="${INPUT_IGNORE_ASSIGNEES_BOT:-false}"
echo "Mode=$MODE, Unknown=$UNKNOWN_ACTION, DryRun=$DRY_RUN, Max=$MAX_TO_PROCESS, Concurrency=$CONCURRENCY, IgnoreBots=$IGNORE_BOTS"

# Guardrail: writes only allowed for devpool-directory/devpool-directory
ALLOWED_REPO="devpool-directory/devpool-directory"
if [ "${WRITE_TARGET_REPO:-$OWNER/$REPO}" != "$ALLOWED_REPO" ]; then
  echo "Guardrail active: WRITE_TARGET_REPO (${WRITE_TARGET_REPO:-$OWNER/$REPO}) != $ALLOWED_REPO. Will not perform writes."
  DRY_RUN="true"
fi

# Collect open directory mirrors (issues whose body is exactly a GitHub issue URL)
: > mirrors.tsv
CURSOR=""
while : ; do
  if [ -z "$CURSOR" ]; then
    RESP=$(gh api graphql -f query='query($owner:String!,$name:String!){ repository(owner:$owner,name:$name){ issues(first:100, states:[OPEN]){ nodes{ id number body url } pageInfo{ hasNextPage endCursor } } } }' -f owner="$OWNER" -f name="$REPO")
  else
    RESP=$(gh api graphql -f query='query($owner:String!,$name:String!,$cursor:String!){ repository(owner:$owner,name:$name){ issues(first:100, after:$cursor, states:[OPEN]){ nodes{ id number body url } pageInfo{ hasNextPage endCursor } } } }' -f owner="$OWNER" -f name="$REPO" -f cursor="$CURSOR")
  fi
  echo "$RESP" | jq -r '
    .data.repository.issues.nodes[]
    | {id:.id, number:.number, body:(.body//""), url}
    | (.body | gsub("https://www.github.com/";"https://github.com/") | gsub("\s+$"; "")) as $bodyNorm
    | select($bodyNorm | test("^https://github\.com/[^/]+/[^/]+/issues/[0-9]+$"))
    | [.number, .id, $bodyNorm] | @tsv' >> mirrors.tsv
  HAS_NEXT=$(echo "$RESP" | jq -r '.data.repository.issues.pageInfo.hasNextPage')
  CURSOR=$(echo "$RESP" | jq -r '.data.repository.issues.pageInfo.endCursor')
  [ "$HAS_NEXT" = "true" ] || break
  sleep 0.05
done

TOTAL=$(wc -l < mirrors.tsv | tr -d ' ')
echo "Open directory mirrors found: $TOTAL"

# Limit total to process up-front if requested
if [ -n "$MAX_TO_PROCESS" ]; then
  head -n "$MAX_TO_PROCESS" mirrors.tsv > mirrors.work
else
  cp mirrors.tsv mirrors.work
fi

: > target-health-actions.tsv

process_one() {
  local ISSUE_NUMBER="$1" ISSUE_ID="$2" PARTNER_URL="$3"
  local PURL POWNER PREPO PNUM http_code state assignees bots_only reason act effective_mode

  # Normalize partner URL and parse components
  PURL=$(echo "$PARTNER_URL" | sed -e 's#https://www.github.com/#https://github.com/#' -e 's/[[:space:]]*$//')
  POWNER=$(echo "$PURL" | awk -F/ '{print $4}')
  PREPO=$(echo "$PURL" | awk -F/ '{print $5}')
  PNUM=$(echo "$PURL" | awk -F/ '{print $7}')
  if [ -z "$POWNER" ] || [ -z "$PREPO" ] || [ -z "$PNUM" ]; then
    echo -e "$ISSUE_NUMBER\tkeep\tunknown_url\t$PURL" >> target-health-actions.tsv
    return 0
  fi

  # Query partner with READ_TOKEN (retry once on 5xx)
  API="https://api.github.com/repos/$POWNER/$PREPO/issues/$PNUM"
  http_code=$(curl -sS -H "Accept: application/vnd.github+json" -H "Authorization: Bearer $READ_TOKEN" -o partner.json -w "%{http_code}" "$API" || true)
  if [ "${http_code#5}" != "$http_code" ]; then
    sleep 0.2
    http_code=$(curl -sS -H "Accept: application/vnd.github+json" -H "Authorization: Bearer $READ_TOKEN" -o partner.json -w "%{http_code}" "$API" || true)
  fi

  reason=""; act=""
  if [ "$http_code" = "200" ]; then
    state=$(jq -r '.state' < partner.json)
    assignees=$(jq -r '.assignees | length' < partner.json)
    bots_only="false"
    if [ "$IGNORE_BOTS" = "true" ]; then
      bots_only=$(jq -r '[.assignees[].login | test(".*\\[bot]$")] | all' < partner.json)
    fi
    # treat only-bot assignees as unassigned when enabled
    if [ "$bots_only" = "true" ]; then assignees=0; fi
    if [ "$state" = "open" ] && [ "$assignees" = "0" ]; then
      echo -e "$ISSUE_NUMBER\tkeep\tok\t$PURL" >> target-health-actions.tsv
      rm -f partner.json
      return 0
    fi
    if [ "$state" = "closed" ]; then
      reason="closed"; act="remediate"
    elif [ "$assignees" != "0" ]; then
      reason="assigned"; act="remediate"
    else
      reason="unknown"; act="$UNKNOWN_ACTION"
    fi
  elif [ "$http_code" = "404" ]; then
    reason="not_found"; act="remediate"
  else
    reason="unknown"; act="$UNKNOWN_ACTION"
  fi
  rm -f partner.json || true

  effective_mode="$MODE"
  if [ "$act" = "label_only" ]; then effective_mode="label_only"; fi

  if [ "$DRY_RUN" = "true" ]; then
    echo -e "$ISSUE_NUMBER\tdry_run\t$reason\t$PURL" >> target-health-actions.tsv
    return 0
  fi

  # Ensure labels exist (memoized per run)
  ensure_reason_label() {
    local LBL="$1"
    mkdir -p .label_cache
    if [ ! -f ".label_cache/${LBL//[^A-Za-z0-9_-]/_}" ]; then
      env -u GH_TOKEN gh api -X POST \
        "/repos/$OWNER/$REPO/labels" -f name="$LBL" -f color=808080 -f description="Directory health remediation" >/dev/null 2>&1 || true
      : > ".label_cache/${LBL//[^A-Za-z0-9_-]/_}"
    fi
  }
  ensure_reason_label "Unavailable"
  ensure_reason_label "Unavailable: ${reason}"

  if [ "$effective_mode" = "delete_then_label" ]; then
    # Delete via GraphQL using App token (retry once)
    if env -u GH_TOKEN gh api graphql -f query='mutation($id:ID!){ deleteIssue(input:{issueId:$id}){ clientMutationId } }' -F id="$ISSUE_ID" >/dev/null 2>&1; then
      sleep 0.06
      echo -e "$ISSUE_NUMBER\tdeleted\t$reason\t$PURL" >> target-health-actions.tsv
      return 0
    else
      sleep 0.2
      if env -u GH_TOKEN gh api graphql -f query='mutation($id:ID!){ deleteIssue(input:{issueId:$id}){ clientMutationId } }' -F id="$ISSUE_ID" >/dev/null 2>&1; then
        sleep 0.06
        echo -e "$ISSUE_NUMBER\tdeleted\t$reason\t$PURL" >> target-health-actions.tsv
        return 0
      fi
    fi
  fi

  # Fallback or label_only: label and close
  env -u GH_TOKEN gh api -X POST \
    -H "Accept: application/vnd.github+json" \
    "/repos/$OWNER/$REPO/issues/$ISSUE_NUMBER/labels" \
    -f labels[]="Unavailable" -f labels[]="Unavailable: ${reason}" >/dev/null 2>&1 || true
  env -u GH_TOKEN gh api -X PATCH \
    -H "Accept: application/vnd.github+json" \
    "/repos/$OWNER/$REPO/issues/$ISSUE_NUMBER" \
    -f state=closed -f state_reason=not_planned >/dev/null 2>&1 || true
  sleep 0.06
  echo -e "$ISSUE_NUMBER\tlabeled_closed\t$reason\t$PURL" >> target-health-actions.tsv
}

# Pre-create base label once
env -u GH_TOKEN gh api -X POST \
  "/repos/$OWNER/$REPO/labels" -f name="Unavailable" -f color=808080 -f description="Directory health remediation" >/dev/null 2>&1 || true

# Run with limited concurrency (counter-based)
running_jobs=0
while IFS=$'\t' read -r ISSUE_NUMBER ISSUE_ID PARTNER_URL; do
  [ -z "$ISSUE_ID" ] && continue
  process_one "$ISSUE_NUMBER" "$ISSUE_ID" "$PARTNER_URL" &
  running_jobs=$((running_jobs + 1))
  if [ "$running_jobs" -ge "$CONCURRENCY" ]; then
    wait -n || true
    running_jobs=$((running_jobs - 1))
  fi
done < mirrors.work
wait || true

# Summarize results
processed=$(wc -l < target-health-actions.tsv | tr -d ' ')
kept=$(grep -cE '\tok\t' target-health-actions.tsv || true)
deleted=$(grep -cE '\tdeleted\t' target-health-actions.tsv || true)
labeled=$(grep -cE '\tlabeled_closed\t' target-health-actions.tsv || true)
unknown=$(grep -cE '\t(dry_run|keep)\tunknown' target-health-actions.tsv || true)
errors=0
echo "Summary: processed=$processed kept=$kept deleted=$deleted labeled_closed=$labeled unknown=$unknown errors=$errors"

# Write report JSON
jq -n --arg repo "$OWNER/$REPO" --arg mode "$MODE" --arg dry "$DRY_RUN" --arg concurrency "$CONCURRENCY" \
  --arg unknown_action "$UNKNOWN_ACTION" --argjson processed ${processed:-0} --argjson kept ${kept:-0} --argjson deleted ${deleted:-0} \
  --argjson labeled ${labeled:-0} --argjson unknown ${unknown:-0} \
  '{ repo:$repo, mode:$mode, dry_run:$dry, concurrency:($concurrency|tonumber), unknown_action:$unknown_action, counts:{ processed:$processed, kept:$kept, deleted:$deleted, labeled_closed:$labeled, unknown:$unknown, errors:0 } }' > target-health-report.json

# Step summary
{
  echo "Directory Target Health Summary"
  echo
  echo "- Repo: $OWNER/$REPO"
  echo "- Mode: $MODE (unknown=$UNKNOWN_ACTION)"
  echo "- Dry run: $DRY_RUN"
  echo "- Concurrency: $CONCURRENCY"
  echo "- Processed: $processed"
  echo "- Kept: $kept"
  echo "- Deleted: $deleted"
  echo "- Labeled+Closed: $labeled"
  echo "- Unknown: $unknown"
  echo
  echo "Sample:"
  tail -n 10 target-health-actions.tsv | sed -e 's/^/  /'
} >> "$GITHUB_STEP_SUMMARY"

exit 0

