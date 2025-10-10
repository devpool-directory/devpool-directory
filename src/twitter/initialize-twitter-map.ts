import { commitTwitterMap } from "../git";
import { DEVPOOL_OWNER_NAME, DEVPOOL_REPO_NAME } from "../directory/directory";

export type TwitterMap = Record<string, string>;

export async function initializeTwitterMap() {
  let twitterMap: TwitterMap = {};
  try {
    const url = `https://raw.githubusercontent.com/${DEVPOOL_OWNER_NAME}/${DEVPOOL_REPO_NAME}/__STORAGE__/twitter-map.json`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    twitterMap = await response.json();
  } catch (error) {
    console.log("Couldn't fetch twitter map, creating a new one");
    await commitTwitterMap(twitterMap);
  }
  return twitterMap;
}
