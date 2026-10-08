export interface Contributor {
  id: string;
  githubId: number;
  role: 'contributor' | 'maintainer' | 'admin';
  walletAddress: string;
}

export interface RewardConfig {
  minRole: 'contributor' | 'maintainer';
  rewardAmount: number;
  currency: string;
}
