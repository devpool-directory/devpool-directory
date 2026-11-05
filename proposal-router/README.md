# Proposal Router

This is a dependency-free MVP for routing new Ubiquity proposals to the most relevant repository.

It provides:

- A GitHub-style proposal composer.
- Live repository suggestions while the user types.
- A target repository dropdown that narrows to the strongest matches.
- A generated GitHub issue URL with the proposal title and body prefilled.
- Preservation of explicit repository choices across proposal edits, including when re-picking the currently selected option.
- Preservation of custom typed issue titles during delayed or in-flight repository catalog loading.

## Local Preview

Serve this folder with any static server and open `index.html`.

```bash
python -m http.server 8091
```

Then visit `http://localhost:8091/proposal-router/`.

## Verification

The router logic can be checked without installing dependencies:

```bash
node proposal-router/router.test.mjs
```

