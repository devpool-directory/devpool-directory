# DevPool Label Format Guide

## Label Formats

### DevPool Directory Issues
Issues in the DevPool directory use these label formats:

- **Pricing**: `Pricing: XXX USD` (e.g., "Pricing: 600 USD")
- **Time**: `Time: <X Day` or `Time: <X Hours` (e.g., "Time: <1 Day", "Time: <4 Hours")
- **Priority**: `Priority: X (Level)` (e.g., "Priority: 3 (High)")
- **Partner**: `Partner: org/repo` (e.g., "Partner: ubiquity/test-repo")
- **ID**: `id: XXX` (references the partner issue)
- **Status**: `Unavailable` (when issue is assigned in partner repo)

### Partner Repository Issues
Issues in partner repositories use slightly different formats:

- **Price**: `Price: XXX USD` (e.g., "Price: 100 USD")
- **Time**: `Time: Xh` or `Time: Xd` (e.g., "Time: 1h", "Time: 2d")

## Key Differences

1. **Pricing vs Price**: DevPool uses "Pricing:" while partners use "Price:"
2. **Time Format**: DevPool uses "<X Day/Hours" format while partners use simpler "Xh/Xd" format
3. **Additional Labels**: DevPool issues have partner reference and ID labels that link back to the original issue

## Testing

The sandbox repository `devpool-directory/devpool-directory-testing` contains all necessary labels for integration testing with real GitHub API calls.