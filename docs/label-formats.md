# DevPool Label Format Guide

## Label Formats

### Directory and Partner Issues
The directory mirrors partner labels. Use these formats:

- **Price**: `Price: XXX USD` (e.g., "Price: 600 USD")
- **Time**: `Time: <X Day` or `Time: <X Hours` (e.g., "Time: <1 Day", "Time: <4 Hours") or partner-style `Time: Xh/Xd` (e.g., "Time: 1h", "Time: 2d")
- **Priority**: `Priority: X (Level)` (e.g., "Priority: 3 (High)")
- **Partner**: `Partner: org/repo` (e.g., "Partner: ubiquity/test-repo")
- **ID**: `id: XXX` (references the partner issue)
- **Status**: `Unavailable` (when issue is assigned in partner repo)

## Notes

- Use the `Price:` prefix exclusively. The older `Pricing:` prefix is deprecated and not recognized by the pipeline.
- The directory does not rename partner labels; it mirrors them exactly.

## Testing

The sandbox repository `devpool-directory/devpool-directory-testing` contains all necessary labels for integration testing with real GitHub API calls.
