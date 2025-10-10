# Test Dashboard


| :clock10: Start time | :hourglass: Duration |
| --- | ---: |
|10/11/2025, 5:15:16 AM|25.368 s|

| | :white_check_mark: Passed | :x: Failed | :construction: Todo | :white_circle: Total |
| --- | ---: | ---: | ---:| ---: |
|Test Suites|7|0|-|7|
|Tests|82|0|0|91|

## tests/devpool-issue-handler.test.ts

41 passed, 0 failed, 0 todo, done in 18.044 s

- :white_check_mark: handleDevPoolIssue
  - :white_check_mark: Devpool directory
    - :white_check_mark: checkIfForkedRepo
    - :white_check_mark: updates issue title in devpool when project issue title changes
    - :white_check_mark: updates issue labels in devpool when project issue labels change
    - :white_check_mark: updates issue body in devpool when project issue url changes
    - :white_check_mark: does not update issue when no metadata changes are detected
    - :white_check_mark: keeps devpool issue state unchanged when project issue state is open and devpool issue state is open
    - :white_check_mark: keeps devpool issue state unchanged when project issue state is closed and devpool issue state is closed
    - :white_check_mark: closes devpool issue when project issue is closed
    - :white_check_mark: reopens devpool issue when project issue is reopened
    - :white_check_mark: adds Unavailable label to devpool issue when project issue is assigned and open
    - :white_check_mark: removes Unavailable label from devpool issue when project issue is closed
    - :white_check_mark: removes Unavailable label from devpool issue when project issue is unassigned and reopened
  - :white_check_mark: Devpool (transferred) directory
    - :white_check_mark: checkIfForkedRepo
    - :white_check_mark: updates issue title in devpool when project issue title changes
    - :white_check_mark: updates issue labels in devpool when project issue labels change
    - :white_check_mark: updates issue body in devpool when project issue url changes
    - :white_check_mark: does not update issue when no metadata changes are detected
    - :white_check_mark: keeps devpool issue state unchanged when project issue state is open and devpool issue state is open
    - :white_check_mark: keeps devpool issue state unchanged when project issue state is closed and devpool issue state is closed
    - :white_check_mark: closes devpool issue when project issue is closed
    - :white_check_mark: reopens devpool issue when project issue is reopened
    - :white_check_mark: adds Unavailable label to devpool issue when project issue is assigned and open
    - :white_check_mark: removes Unavailable label from devpool issue when project issue is closed
    - :white_check_mark: removes Unavailable label from devpool issue when project issue is unassigned and reopened
  - :white_check_mark: Forked Devpool directory
    - :white_check_mark: checkIfForkedRepo
    - :white_check_mark: updates issue title in devpool when project issue title changes
    - :white_check_mark: updates issue labels in devpool when project issue labels change
    - :white_check_mark: updates issue body in devpool when project issue url changes
    - :white_check_mark: does not update issue when no metadata changes are detected
    - :white_check_mark: keeps devpool issue state unchanged when project issue state is open and devpool issue state is open
    - :white_check_mark: keeps devpool issue state unchanged when project issue state is closed and devpool issue state is closed
    - :white_check_mark: closes devpool issue when project issue is closed
    - :white_check_mark: reopens devpool issue when project issue is reopened
    - :white_check_mark: adds Unavailable label to devpool issue when project issue is assigned and open
    - :white_check_mark: removes Unavailable label from devpool issue when project issue is closed
    - :white_check_mark: removes Unavailable label from devpool issue when project issue is unassigned and reopened
  - :white_check_mark: getRepoUrls
- :running: createDevPoolIssue (integration)
  - :running: Devpool directory
    - :running: only creates a new devpool issue if it's unassigned, opened and not already a devpool issue
    - :running: does not create a new devpool issue if it's already a devpool issue
    - :running: does not create a new devpool issue if it's closed
  - :running: Devpool (transferred) directory
    - :running: only creates a new devpool issue if it's unassigned, opened and not already a devpool issue
    - :running: does not create a new devpool issue if it's already a devpool issue
    - :running: does not create a new devpool issue if it's closed
  - :running: Forked Devpool directory
    - :running: only creates a new devpool issue if it's unassigned, opened and not already a devpool issue
    - :running: does not create a new devpool issue if it's already a devpool issue
    - :running: does not create a new devpool issue if it's closed
- :white_check_mark: getProjectUrls
  - :white_check_mark: returns projects not included in Opt.out
- :white_check_mark: calculateStatistics
  - :white_check_mark: calculates statistics correctly for empty issues array
  - :white_check_mark: calculates statistics correctly for issues with different labels and states
  - :white_check_mark: ignores invalid pricing labels and logs an error

## tests/duplicate-prevention.test.ts

11 passed, 0 failed, 0 todo, done in 6.804 s

- :white_check_mark: Duplicate Issue Prevention
  - :white_check_mark: Duplicate detection logic
    - :white_check_mark: Should identify duplicate issues with same ID label
    - :white_check_mark: Should keep oldest issue and mark newer ones as duplicates
    - :white_check_mark: Should skip closed issues when checking for duplicates
    - :white_check_mark: Should handle multiple duplicate sets
  - :white_check_mark: API optimization
    - :white_check_mark: Should use per_page parameter for efficiency
    - :white_check_mark: Should check for existing issues when label exists
    - :white_check_mark: Should not check for existing issues when label is new
  - :white_check_mark: Error handling
    - :white_check_mark: Should have proper error message for duplicate check failure
    - :white_check_mark: Should distinguish between label creation errors
  - :white_check_mark: Deduplication sorting
    - :white_check_mark: Should correctly sort issues by creation date
    - :white_check_mark: Should handle issues with same timestamp

## tests/helpers.test.ts

9 passed, 0 failed, 0 todo, done in 7.249 s

- :white_check_mark: GitHub items
  - :white_check_mark: Get owner and repo values
  - :white_check_mark: Throw error on missing owner or repo
  - :white_check_mark: Get social media text
  - :white_check_mark: Get issue price label
  - :white_check_mark: Get issue label value
  - :white_check_mark: Get issue by label
  - :white_check_mark: Get DevPool labels
  - :white_check_mark: Get repo urls
  - :white_check_mark: Get all issues

## tests/integration/sandbox-api.test.ts

12 passed, 0 failed, 0 todo, done in 24.863 s

- :white_check_mark: Sandbox GitHub API Integration Tests
  - :white_check_mark: Issue Operations
    - :white_check_mark: should create a new issue
    - :white_check_mark: should update issue title
    - :white_check_mark: should add labels to issue
    - :white_check_mark: should list repository issues
    - :white_check_mark: should close an issue
    - :white_check_mark: should reopen an issue
  - :white_check_mark: DevPool Directory Scenarios
    - :white_check_mark: should simulate partner issue creation
    - :white_check_mark: should create corresponding devpool issue
    - :white_check_mark: should sync title changes from partner to devpool
    - :white_check_mark: should handle issue assignment
  - :white_check_mark: Error Handling
    - :white_check_mark: should handle non-existent issue gracefully
    - :white_check_mark: should handle invalid operations gracefully

## tests/twitter-sync.assigned-delete.test.ts

1 passed, 0 failed, 0 todo, done in 7.214 s

- :white_check_mark: Twitter Sync assigned -> delete
  - :white_check_mark: assigned issues are excluded and mapped tweets are deleted

## tests/twitter-sync.plan-apply.test.ts

1 passed, 0 failed, 0 todo, done in 7.25 s

- :white_check_mark: Twitter Sync plan/apply
  - :white_check_mark: creates tweet for open+priced+unassigned, then deletes when issue is closed

## tests/unplanned-issues.test.ts

7 passed, 0 failed, 0 todo, done in 6.924 s

- :white_check_mark: Unplanned Issues Filtering
  - :white_check_mark: Issue Filtering Logic
    - :white_check_mark: Should filter out issues closed as not_planned
    - :white_check_mark: Should keep open issues regardless of state_reason
    - :white_check_mark: Should keep closed issues with other state_reasons
  - :white_check_mark: GitHubIssueWithStateReason interface
    - :white_check_mark: Should accept valid state_reason values
    - :white_check_mark: Should properly extend GitHubIssue
  - :white_check_mark: Filtering logic validation
    - :white_check_mark: Should correctly identify unplanned issues
    - :white_check_mark: Should handle mixed issue states correctly

