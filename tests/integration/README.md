# Integration Tests

These are real GitHub API integration tests that use the sandbox repository `devpool-directory/devpool-directory-testing`.

## Setup

1. Ensure you have a valid `GITHUB_TOKEN` in your environment
2. The sandbox repository `devpool-directory/devpool-directory-testing` must exist
3. Required labels will be created automatically if missing

## Running Tests

```bash
# Run only integration tests
bun test:integration

# Run only unit tests (with mocks)
bun test:unit

# Run all tests
bun test
```

## Sandbox Repository

The tests use `devpool-directory/devpool-directory-testing` as a sandbox environment for real API operations. This repository is safe to use for testing as it's specifically designated for this purpose.

### Test Coverage

- **Issue Operations**: Creating, updating, labeling, listing, closing, and reopening issues
- **DevPool Scenarios**: Partner issue creation, devpool issue syncing, assignment handling
- **Error Handling**: Invalid operations and non-existent resources

## Benefits

- **Real API Testing**: Tests actual GitHub API behavior instead of mocked responses
- **Isolation**: Uses a dedicated sandbox repository to avoid affecting production data
- **Comprehensive**: Covers the full lifecycle of DevPool directory operations

## Notes

- Tests run with `--runInBand` to avoid race conditions
- Each test suite cleans up after itself by closing created issues
- Tests have a 30-second timeout for API operations