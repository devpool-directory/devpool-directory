export function getRepoCredentials(url: string): [string, string] {
  const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) throw new Error(`Invalid GitHub URL: ${url}`);
  return [match[1], match[2]];
}
