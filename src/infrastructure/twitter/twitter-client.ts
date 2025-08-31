import { injectable, inject } from "inversify";
import { TwitterApi } from "twitter-api-v2";
import { TYPES } from "../../shared/types";
import { Logger } from "../../shared/logger";

export interface TweetData {
  id: string;
  text: string;
  createdAt: Date;
}

export interface TwitterService {
  postTweet(text: string): Promise<TweetData | null>;
  deleteTweet(tweetId: string): Promise<boolean>;
  getTweet(tweetId: string): Promise<TweetData | null>;
}

@injectable()
export class TwitterClient implements TwitterService {
  private client: TwitterApi | null = null;
  private enabled: boolean = false;

  constructor(@inject(TYPES.Logger) private logger: Logger, @inject(TYPES.Config) private config: any) {
    this.initialize();
  }

  private initialize(): void {
    const { TWITTER_API_KEY, TWITTER_API_KEY_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET } = process.env;

    if (!TWITTER_API_KEY || !TWITTER_API_KEY_SECRET || !TWITTER_ACCESS_TOKEN || !TWITTER_ACCESS_TOKEN_SECRET) {
      this.logger.warn("Twitter API credentials not found. Twitter integration disabled.");
      this.enabled = false;
      return;
    }

    try {
      this.client = new TwitterApi({
        appKey: TWITTER_API_KEY,
        appSecret: TWITTER_API_KEY_SECRET,
        accessToken: TWITTER_ACCESS_TOKEN,
        accessSecret: TWITTER_ACCESS_TOKEN_SECRET,
      });

      this.enabled = true;
      this.logger.info("Twitter client initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize Twitter client", error);
      this.enabled = false;
    }
  }

  async postTweet(text: string): Promise<TweetData | null> {
    if (!this.enabled || !this.client) {
      this.logger.debug("Twitter integration disabled, skipping tweet post");
      return null;
    }

    try {
      const response = await this.client.v2.tweet(text);

      return {
        id: response.data.id,
        text: response.data.text || text,
        createdAt: new Date(),
      };
    } catch (error) {
      this.logger.error("Failed to post tweet", { text, error });
      return null;
    }
  }

  async deleteTweet(tweetId: string): Promise<boolean> {
    if (!this.enabled || !this.client) {
      this.logger.debug("Twitter integration disabled, skipping tweet deletion");
      return false;
    }

    try {
      await this.client.v2.deleteTweet(tweetId);
      return true;
    } catch (error) {
      this.logger.error("Failed to delete tweet", { tweetId, error });
      return false;
    }
  }

  async getTweet(tweetId: string): Promise<TweetData | null> {
    if (!this.enabled || !this.client) {
      this.logger.debug("Twitter integration disabled");
      return null;
    }

    try {
      const response = await this.client.v2.singleTweet(tweetId);

      return {
        id: response.data.id,
        text: response.data.text,
        createdAt: new Date(response.data.created_at || new Date()),
      };
    } catch (error) {
      this.logger.error("Failed to get tweet", { tweetId, error });
      return null;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
