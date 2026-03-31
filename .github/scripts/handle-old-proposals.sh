#!/usr/bin/env bash
# Handle Old Proposals - Posts reminders and closes stale proposals
# Proposals = open issues without a Price: label
set -euo pipefail

INACTIVITY_THRESHOLD="${INACTIVITY_THRESHOLD:-30}"
FOLLOW_UP_THRESHOLD="${FOLLOW_UP_THRESHOLD:-7}"
OWNER="${OWNER:-}"
REPO="${REPO:-}"
GH_TOKEN="${GH_TOKEN:-}"
DRY_RUN="${DRY_RUN:-true}"

if [ -z "$OWNER" ] || [ -z "$REPO" ] || [ -z "$GH_TOKEN" ]; then
  echo "Error: OWNER, REPO, and GH_TOKEN are required"
  exit 1
fi

export GH_TOKEN
export OWNER
export REPO

NOW=$(date +%s)
STALE_TS=$((NOW - (INACTIVITY_THRESHOLD * 86400)))
FOLLOWUP_TS=$((NOW - (FOLLOW_UP_THRESHOLD * 86400)))

echo "Current timestamp: $NOW"
echo "Stale threshold (no activity for $INACTIVITY_THRESHOLD days): $STALE_TS"
echo "Follow-up threshold (wait $FOLLOW_UP_THRESHOLD days after reminder): $FOLLOWUP_TS"

: > /tmp/reminders.txt
: > /tmp/to_close.txt

# Helper function to check if issue has a Price label
has_price_label() {
  local labels_json="$1"
  echo "$labels_json" | jq -r '[.[].name] | any(startswith("Price:"))'
}

# Fetch all open issues without Price label (proposals)
CURSOR=""
while : ; do
  if [ -z "$CURSOR" ]; then
    RESP=$(gh api graphql -f query='
      query($owner:String!,$name:String!){
        repository(owner:$owner,name:$name){
          issues(first:100, states:OPEN, orderBy:{field:UPDATED_AT, direction:DESC}){
            nodes{
              id
              number
              title
              url
              createdAt
              updatedAt
              labels(first:50){ nodes{ name } }
              comments(first:10){
                nodes{ createdAt author{ login } body }
              }
            }
            pageInfo{ hasNextPage endCursor }
          }
        }
      }' -f owner="$OWNER" -f name="$REPO" --jq '.data.repository.issues')
  else
    RESP=$(gh api graphql -f query='
      query($owner:String!,$name:String!,$cursor:String!){
        repository(owner:$owner,name:$name){
          issues(first:100, states:OPEN, after:$cursor, orderBy:{field:UPDATED_AT, direction:DESC}){
            nodes{
              id
              number
              title
              url
              createdAt
              updatedAt
              labels(first:50){ nodes{ name } }
              comments(first:10){
                nodes{ createdAt author{ login } body }
              }
            }
            pageInfo{ hasNextPage endCursor }
          }
        }
      }' -f owner="$OWNER" -f name="$REPO" -f cursor="$CURSOR" --jq '.data.repository.issues')
  fi

  LENGTH=$(echo "$RESP" | jq length)
  [ "$LENGTH" = "0" ] && break

  # Filter for issues without Price label (proposals)
  echo "$RESP" | jq -c '.nodes[]' 2>/dev/null | while IFS= read -r issue; do
    LABELS=$(echo "$issue" | jq -c '.labels.nodes')
    HAS_PRICE=$(has_price_label "$LABELS")
    
    if [ "$HAS_PRICE" = "false" ]; then
      UPDATED_AT=$(echo "$issue" | jq -r '.updatedAt')
      UPDATED_EPOCH=$(date -d "$UPDATED_AT" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$UPDATED_AT" +%s 2>/dev/null || echo "0")
      UPDATED_EPOCH=${UPDATED_EPOCH%%.*}
      
      # Check if stale (no activity since threshold)
      if [ "$UPDATED_EPOCH" -gt 0 ] && [ "$UPDATED_EPOCH" -lt "$STALE_TS" ]; then
        NUMBER=$(echo "$issue" | jq -r '.number')
        TITLE=$(echo "$issue" | jq -r '.title')
        URL=$(echo "$issue" | jq -r '.url')
        
        # Check if we already commented asking for update
        # Look for comments from the bot or github-actions
        LAST_BOT_COMMENT_TS=0
        for comment in $(echo "$issue" | jq -r '.comments.nodes[] | @json'); do
          AUTHOR=$(echo "$comment" | jq -r '.author.login')
          if [[ "$AUTHOR" == *"bot" ]] || [[ "$AUTHOR" == *"github-actions"* ]]; then
            CREATED=$(echo "$comment" | jq -r '.createdAt')
            CREATED_TS=$(date -d "$CREATED" +%s 2>/dev/null || echo "0")
            if [ "$CREATED_TS" -gt "$LAST_BOT_COMMENT_TS" ]; then
              LAST_BOT_COMMENT_TS=$CREATED_TS
            fi
          fi
        done
        
        if [ "$LAST_BOT_COMMENT_TS" -eq 0 ] || [ "$LAST_BOT_COMMENT_TS" -lt "$FOLLOWUP_TS" ]; then
          # Need to send reminder
          echo "REMINDER: #$NUMBER - $TITLE ($URL)"
          echo "{\"number\":$NUMBER,\"title\":\"$TITLE\",\"url\":\"$URL\"}" >> /tmp/reminders.txt
        else
          # Already reminded, should close
          echo "CLOSE: #$NUMBER - $TITLE ($URL)"
          echo "{\"number\":$NUMBER,\"title\":\"$TITLE\",\"url\":\"$URL\"}" >> /tmp/to_close.txt
        fi
      fi
    fi
  done
  
  # Check if there are more pages
  HAS_NEXT=$(echo "$RESP" | jq -r '.pageInfo.hasNextPage')
  CURSOR=$(echo "$RESP" | jq -r '.pageInfo.endCursor // empty')
  [ "$HAS_NEXT" != "true" ] && break
  sleep 0.5
done

echo ""
echo "Summary:"
echo "  Reminders to issue: $(wc -l < /tmp/reminders.txt | tr -d ' ')"
echo "  Proposals to close: $(wc -l < /tmp/to_close.txt | tr -d ' ')"

# Execute actions
if [ "$DRY_RUN" = "false" ]; then
  echo ""
  echo "Posting reminders..."
  while IFS= read -r issue; do
    NUMBER=$(echo "$issue" | jq -r '.number')
    gh issue comment "$NUMBER" --repo "$OWNER/$REPO" --body "This proposal appears to be stale. Is it still relevant?

Please provide an update or additional details. If no response is received within 7 days, this proposal may be closed."
    echo "  Reminder posted for #$NUMBER"
    sleep 1
  done < /tmp/reminders.txt
  
  echo ""
  echo "Closing proposals..."
  while IFS= read -r issue; do
    NUMBER=$(echo "$issue" | jq -r '.number')
    gh issue close "$NUMBER" --repo "$OWNER/$REPO" --comment "This proposal has been closed due to inactivity. If you're still interested, please feel free to reopen or create a new proposal."
    echo "  Closed #$NUMBER"
    sleep 1
  done < /tmp/to_close.txt
else
  echo ""
  echo "[DRY RUN] Would post $(wc -l < /tmp/reminders.txt) reminders and close $(wc -l < /tmp/to_close.txt) proposals"
fi
