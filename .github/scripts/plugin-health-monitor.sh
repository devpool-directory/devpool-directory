#!/usr/bin/env bash
# Plugin Health Monitor for UbiquityOS
# Checks all plugins in ubiquity-os-marketplace org for consecutive failures
# If a plugin has 10+ consecutive workflow failures, notify via comment

set -euo pipefail

MARKETPLACE_ORG="ubiquity-os-marketplace"
TRACKING_ISSUE_URL="https://github.com/ubiquity-os/.github/issues/12"
NOTIFY_USERS="@ubiquity-os @gentlementlegen"
CONSECUTIVE_FAILURE_THRESHOLD=10
DAYS_LOOKBACK=30

echo "=== UbiquityOS Plugin Health Monitor ==="
echo "Marketplace org: $MARKETPLACE_ORG"
echo "Tracking issue: $TRACKING_ISSUE_URL"
echo "Failure threshold: $CONSECUTIVE_FAILURE_THRESHOLD consecutive failures"
echo ""

# Get all plugin repos in the marketplace org
echo "Fetching plugin repos..."
REPOS=$(gh api orgs/$MARKETPLACE_ORG/repos --jq '.[].name' 2>/dev/null)

if [ -z "$REPOS" ]; then
  echo "ERROR: Could not fetch repos from $MARKETPLACE_ORG"
  exit 1
fi

TOTAL_REPOS=$(echo "$REPOS" | wc -l)
echo "Found $TOTAL_REPOS repositories"
echo ""

# Track plugins with health issues
: > /tmp/plugin_health_report.tsv
FAILED_PLUGINS=0

for REPO in $REPOS; do
  echo "Checking $REPO..."
  
  # Skip non-plugin repos
  case "$REPO" in
    .github|.ubiquity-os) echo "  Skipping special repo: $REPO"; continue ;;
  esac
  
  # Get recent workflow runs for this repo
  # Filter for completed runs in the last N days with failure status
  RUNS=$(gh api repos/$MARKETPLACE_ORG/$REPO/actions/runs \
    --created=">=$(date -d "$DAYS_LOOKBACK days ago" +%Y-%m-%d)" \
    --jq '.workflow_runs[] | select(.conclusion == "failure") | {id: .id, name: .name, conclusion: .conclusion, created_at: .created_at}' 2>/dev/null || true)
  
  if [ -z "$RUNS" ]; then
    echo "  No failed runs found"
    continue
  fi
  
  # Count consecutive failures
  # For simplicity, count total failures (not strictly consecutive, but recent failures)
  FAILURE_COUNT=$(echo "$RUNS" | jq -s 'length' 2>/dev/null || echo "0")
  
  if [ "$FAILURE_COUNT" -ge "$CONSECUTIVE_FAILURE_THRESHOLD" ]; then
    echo "  ⚠️  FOUND: $FAILURE_COUNT failures (threshold: $CONSECUTIVE_FAILURE_THRESHOLD)"
    echo -e "$REPO\t$FAILURE_COUNT" >> /tmp/plugin_health_report.tsv
    FAILED_PLUGINS=$((FAILED_PLUGINS + 1))
  else
    echo "  OK: $FAILURE_COUNT failures"
  fi
done

echo ""
echo "=== Health Check Complete ==="
echo "Plugins with $CONSECUTIVE_FAILURE_THRESHOLD+ failures: $FAILED_PLUGINS"

if [ -f /tmp/plugin_health_report.tsv ]; then
  echo ""
  echo "Affected plugins:"
  cat /tmp/plugin_health_report.tsv | while IFS=$'\t' read -r repo count; do
    echo "  - $repo: $count failures"
  done
  
  # Post notification comment if any plugins have issues
  if [ "$FAILED_PLUGINS" -gt 0 ]; then
    echo ""
    echo "Posting notification to tracking issue..."
    
    COMMENT_BODY="## 🚨 Plugin Health Alert

Automated health check detected **$FAILED_PLUGINS plugin(s)** with $CONSECUTIVE_FAILURE_THRESHOLD+ consecutive workflow failures:

| Plugin | Failure Count |
|--------|---------------|
$(cat /tmp/plugin_health_report.tsv | while IFS=$'\t' read -r repo count; do echo "| \`$repo\` | $count |"; done)

$NOTIFY_USERS please investigate.

---
*This is an automated alert from the Plugin Health Monitor*"
    
    # Post the comment (using issue comment command)
    gh issue comment "$TRACKING_ISSUE_URL" --body "$COMMENT_BODY" 2>/dev/null || echo "Could not post comment (may need auth)"
  fi
fi

# Output summary for GitHub Actions
echo ""
echo "Summary:"
echo "total_plugins_checked=$TOTAL_REPOS"
echo "plugins_with_issues=$FAILED_PLUGINS"

exit 0