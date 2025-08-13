import { DEVPOOL_OWNER_NAME } from "./directory";

//=============
// Helpers
//=============
/**
 * Stops forks from spamming real devpool directory issues with links to their forks
 * @returns true if the repository is a fork (not the official devpool directory)
 */

export async function checkIfForked() {
  // derived from `${{ github.repository_owner }}` from the yml workflow, which reads the owner of the repository
  // Both "ubiquity" (original) and "devpool-directory" (after transfer) are considered official
  const officialOwners = ["ubiquity", "devpool-directory"];
  return !officialOwners.includes(DEVPOOL_OWNER_NAME);
}
