import { distributeRewards, calculateReward } from '../src/directory/rewardDistribution';

describe('Reward Distribution', () => {
  const baseReward = 10;
  const reopenedMultiplier = 0.5;

  it('calculates base reward for a new issue', () => {
    const issue = { user: { login: 'alice' }, reopened: false } as any;
    expect(calculateReward(issue)).toBe(baseReward);
  });

  it('applies multiplier for reopened issues', () => {
    const issue = { user: { login: 'bob' }, reopened: true } as any;
    expect(calculateReward(issue)).toBe(baseReward * reopenedMultiplier);
  });

  it('distributes rewards correctly across multiple issues', () => {
    const issues = [
      { user: { login: 'alice' }, reopened: false },
      { user: { login: 'alice' }, reopened: true },
      { user: { login: 'bob' }, reopened: false },
      { user: { login: 'bob' }, reopened: true },
    ] as any[];

    const result = distributeRewards(issues);

    expect(result).toEqual({
      alice: baseReward + baseReward * reopenedMultiplier, // 10 + 5 = 15
      bob: baseReward + baseReward * reopenedMultiplier,   // 10 + 5 = 15
    });
  });

  it('handles unknown authors gracefully', () => {
    const issues = [
      { user: null, reopened: false },
      { user: undefined, reopened: true },
    ] as any[];

    const result = distributeRewards(issues);
    expect(result).toEqual({
      unknown: baseReward + baseReward * reopenedMultiplier,
    });
  });
});
