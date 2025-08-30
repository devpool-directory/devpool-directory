import { injectable, inject } from 'inversify';
import { TYPES } from '../../shared/types';
import { GitStorageRepository } from '../../infrastructure/storage/git-storage.repository';
import { Logger } from '../../shared/logger';

export interface TweetMapping {
  issueNodeId: string;
  tweetId: string;
  postedAt: Date;
}

@injectable()
export class TwitterMappingService {
  private static readonly TWITTER_MAP_FILE = 'devpool-twitter-mapping.json';
  private twitterMap: Map<string, string> = new Map();

  constructor(
    @inject(TYPES.GitStorageRepository) private storage: GitStorageRepository,
    @inject(TYPES.Logger) private logger: Logger
  ) {}

  async initialize(): Promise<void> {
    try {
      const data = await this.storage.read(TwitterMappingService.TWITTER_MAP_FILE);
      
      if (data && Array.isArray(data)) {
        this.twitterMap = new Map(data.map((item: TweetMapping) => [
          item.issueNodeId,
          item.tweetId
        ]));
        this.logger.info(`Loaded ${this.twitterMap.size} Twitter mappings`);
      }
    } catch (error) {
      this.logger.error('Failed to load Twitter mappings', error);
      this.twitterMap = new Map();
    }
  }

  async addMapping(issueNodeId: string, tweetId: string): Promise<void> {
    this.twitterMap.set(issueNodeId, tweetId);
    await this.persist();
  }

  async removeMapping(issueNodeId: string): Promise<void> {
    this.twitterMap.delete(issueNodeId);
    await this.persist();
  }

  getTweetId(issueNodeId: string): string | undefined {
    return this.twitterMap.get(issueNodeId);
  }

  hasTweet(issueNodeId: string): boolean {
    return this.twitterMap.has(issueNodeId);
  }

  async persist(): Promise<void> {
    try {
      const data: TweetMapping[] = Array.from(this.twitterMap.entries()).map(([issueNodeId, tweetId]) => ({
        issueNodeId,
        tweetId,
        postedAt: new Date()
      }));

      await this.storage.write(TwitterMappingService.TWITTER_MAP_FILE, data);
      this.logger.debug(`Persisted ${data.length} Twitter mappings`);
    } catch (error) {
      this.logger.error('Failed to persist Twitter mappings', error);
      throw error;
    }
  }

  getAllMappings(): Map<string, string> {
    return new Map(this.twitterMap);
  }

  async clearAll(): Promise<void> {
    this.twitterMap.clear();
    await this.persist();
  }
}