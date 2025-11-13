import { loadConfig } from "../config/load";

export async function getPartnerUrls(): Promise<string[]> {
  return loadConfig().explicit_urls;
}
