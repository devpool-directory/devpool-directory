, deleteBudget }, twitterMap });
  await writeTwitterMap(twitterMap);
  await writeArtifacts([
    { path: "twitter-delta.json", data: delta },
  ]);
  try {
    const mod = await import("../git");
    await mod.gitPush();
  } catch (e) {
    console.warn("Skipping git push for apply (likely missing token):", e instanceof Error ? e.message : e);
  }

  const desiredCount = desired.size;
  const currentManaged = current.filter((t) => Object.values(twitterMap).includes(t.id)).length;
  const summary = {
    owner: process.env.DEVPOOL_OWNER_NAME || process.env.DIRECTORY_OWNER,
    repo: process.env.DEVPOOL_REPO_NAME || process.env.DIRECTORY_REPO,
    desiredCount,
    currentManaged,
    createsApplied: Object.keys(delta.created).length,
    deletesApplied: delta.deleted.length,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error("twitter:apply failed:", e);
  process.exit(1);
});