/**
 * Recruiting: Dragonfly CTF II
 *
 * Implements outreach automation and talent pipeline management for recruiting
 * Solidity developers from Dragonfly CTF leaderboards. Scrapes player profiles,
 * generates personalized outreach, and tracks DevPool login conversion.
 *
 * Addresses: devpool-directory#5035 / ubiquity/business-development#155
 */

export interface CtfPlayer {
  username: string;
  platform: "puzzlebox" | "nottingham";
  profileUrl: string;
  githubHandle?: string;
  twitterHandle?: string;
  rank?: number;
  score?: number;
}

export interface OutreachMessage {
  recipient: string;
  channel: "dm" | "email" | "twitter" | "telegram";
  content: string;
  sentAt?: number;
  status: "draft" | "sent" | "replied" | "converted" | "ignored";
}

export interface RecruitmentConfig {
  ctfUrls: {
    puzzlebox: string;
    nottingham: string;
  };
  devpoolLoginUrl: string;
  maxOutreachPerDay: number;
  followUpAfterDays: number;
}

const DEFAULT_CONFIG: RecruitmentConfig = {
  ctfUrls: {
    puzzlebox: "https://puzzlebox.dragonfly.xyz/scores",
    nottingham: "https://nottingham.dragonfly.xyz/players?sortBy=skill",
  },
  devpoolLoginUrl: "https://devpool.directory",
  maxOutreachPerDay: 20,
  followUpAfterDays: 7,
};

/**
 * Parses Puzzlebox leaderboard to extract player profiles with Twitter links.
 * Returns array of players sorted by rank/score.
 */
export function parsePuzzleboxLeaderboard(htmlContent: string): CtfPlayer[] {
  const players: CtfPlayer[] = [];
  // Pattern: look for score table rows with Twitter profile links
  const rowPattern = /<tr[^>]*>[\s\S]*?<a[^>]*href="https:\/\/twitter\.com\/([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<td>(\d+)<\/td>/gi;
  let match;
  let rank = 1;

  while ((match = rowPattern.exec(htmlContent)) !== null) {
    players.push({
      username: match[2].trim(),
      platform: "puzzlebox",
      profileUrl: `https://twitter.com/${match[1]}`,
      twitterHandle: match[1],
      rank: rank++,
      score: parseInt(match[3], 10),
    });
  }

  return players.sort((a, b) => (b.score || 0) - (a.score || 0));
}

/**
 * Parses Nottingham leaderboard to extract player profiles with GitHub links.
 * Returns array of players sorted by skill.
 */
export function parseNottinghamLeaderboard(htmlContent: string): CtfPlayer[] {
  const players: CtfPlayer[] = [];
  // Pattern: look for player rows with GitHub profile links
  const rowPattern = /<tr[^>]*>[\s\S]*?<a[^>]*href="https:\/\/github\.com\/([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<td>(\d+)<\/td>/gi;
  let match;
  let rank = 1;

  while ((match = rowPattern.exec(htmlContent)) !== null) {
    players.push({
      username: match[2].trim(),
      platform: "nottingham",
      profileUrl: `https://github.com/${match[1]}`,
      githubHandle: match[1],
      rank: rank++,
      score: parseInt(match[3], 10),
    });
  }

  return players.sort((a, b) => (b.score || 0) - (a.score || 0));
}

/**
 * Generates personalized outreach message based on player's CTF performance.
 * Emphasizes DevPool's value: paid Solidity bounties matching their skill level.
 */
export function generateOutreachMessage(
  player: CtfPlayer,
  config: RecruitmentConfig = DEFAULT_CONFIG
): OutreachMessage {
  const skillDescriptor = player.rank && player.rank <= 10 ? "top-tier" : "skilled";
  const platformName = player.platform === "puzzlebox" ? "Puzzlebox" : "Searchers of Nottingham";

  const content = `Hey ${player.username}! Saw your ${skillDescriptor} performance on Dragonfly's ${platformName} CTF 🏆

We're building DevPool — a bounty platform where Solidity devs like you get paid to solve real protocol issues. When you login with GitHub at ${config.devpoolLoginUrl}, we automatically match you to relevant tasks based on your past work.

Given your CTF ranking, we think you'd be a great fit for some high-value security and smart contract bounties we have open. Want to check it out?`;

  const channel = player.twitterHandle ? "twitter" : player.githubHandle ? "dm" : "email";
  const recipient = player.twitterHandle || player.githubHandle || player.username;

  return {
    recipient,
    channel,
    content,
    status: "draft",
  };
}

/**
 * Validates that a player has a reachable contact method.
 */
export function isContactable(player: CtfPlayer): boolean {
  return !!(player.twitterHandle || player.githubHandle);
}

/**
 * Filters players to only those with valid contact methods.
 */
export function filterContactablePlayers(players: CtfPlayer[]): CtfPlayer[] {
  return players.filter(isContactable);
}

/**
 * Checks if outreach rate limit has been reached for the day.
 */
export function canSendMoreToday(
  messagesSentToday: number,
  config: RecruitmentConfig = DEFAULT_CONFIG
): boolean {
  return messagesSentToday < config.maxOutreachPerDay;
}

/**
 * Determines which players are due for follow-up based on last contact date.
 */
export function getFollowUpCandidates(
  messages: OutreachMessage[],
  currentTime: number = Date.now(),
  config: RecruitmentConfig = DEFAULT_CONFIG
): OutreachMessage[] {
  const followUpMs = config.followUpAfterDays * 24 * 60 * 60 * 1000;

  return messages.filter((m) => {
    if (m.status !== "sent") return false;
    if (!m.sentAt) return false;
    return currentTime - m.sentAt >= followUpMs;
  });
}

/**
 * Generates a recruitment pipeline report showing conversion funnel.
 */
export function generateRecruitmentReport(
  players: CtfPlayer[],
  messages: OutreachMessage[]
): string {
  const totalPlayers = players.length;
  const contactable = filterContactablePlayers(players).length;
  const drafted = messages.filter((m) => m.status === "draft").length;
  const sent = messages.filter((m) => m.status === "sent").length;
  const replied = messages.filter((m) => m.status === "replied").length;
  const converted = messages.filter((m) => m.status === "converted").length;

  const lines = [
    "## Dragonfly CTF Recruitment Pipeline",
    "",
    "| Stage | Count | Rate |",
    "|-------|-------|------|",
    `| Total Players | ${totalPlayers} | 100% |`,
    `| Contactable | ${contactable} | ${totalPlayers ? ((contactable / totalPlayers) * 100).toFixed(1) : 0}% |`,
    `| Drafted | ${drafted} | - |`,
    `| Sent | ${sent} | ${contactable ? ((sent / contactable) * 100).toFixed(1) : 0}% |`,
    `| Replied | ${replied} | ${sent ? ((replied / sent) * 100).toFixed(1) : 0}% |`,
    `| Converted (Logged In) | ${converted} | ${sent ? ((converted / sent) * 100).toFixed(1) : 0}% |`,
    "",
    "### Platform Breakdown",
    `- Puzzlebox (Twitter): ${players.filter((p) => p.platform === "puzzlebox").length}`,
    `- Nottingham (GitHub): ${players.filter((p) => p.platform === "nottingham").length}`,
  ];

  return lines.join("\n");
}

/**
 * Generates the compelling offer text for initial outreach campaigns.
 * Per issue: "We need to figure out the compelling offer"
 */
export function generateCompellingOffer(): string {
  return `🎯 Exclusive for Dragonfly CTF Players

As a top CTF performer, you get:
• Priority access to high-value Solidity security bounties ($500-$5000+)
• Automatic task matching based on your GitHub history
• Direct invites to protocol teams looking for auditors
• Early access to new bounty categories before public release

No application needed — just login with GitHub at devpool.directory and your profile auto-populates.`;
}

export { DEFAULT_CONFIG };
