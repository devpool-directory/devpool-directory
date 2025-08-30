import { injectable } from 'inversify';
import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

const EnvironmentSchema = z.object({
  github: z.object({
    token: z.string().default(''),
    owner: z.string().default(''),
    repo: z.string().default(''),
    defaultBranch: z.string().default('main'),
    apiUrl: z.string().url().default('https://api.github.com'),
    maxRetries: z.number().default(3),
    rateLimitBuffer: z.number().default(100)
  }),
  twitter: z.object({
    enabled: z.boolean().default(false),
    apiKey: z.string().optional(),
    apiSecret: z.string().optional(),
    accessToken: z.string().optional(),
    accessTokenSecret: z.string().optional(),
    bearerToken: z.string().optional()
  }),
  storage: z.object({
    branch: z.string().default('__STORAGE__'),
    path: z.string().default('.storage')
  }),
  sync: z.object({
    intervalMinutes: z.number().default(30),
    batchSize: z.number().default(100),
    enableAutomaticSync: z.boolean().default(true)
  }),
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    format: z.enum(['json', 'pretty']).default('json'),
    outputPath: z.string().optional()
  }),
  features: z.object({
    enableDuplicateDetection: z.boolean().default(true),
    enablePriceCalculation: z.boolean().default(true),
    enableStatistics: z.boolean().default(true),
    enableNotifications: z.boolean().default(false)
  })
});

export type IEnvironmentConfig = z.infer<typeof EnvironmentSchema>;

@injectable()
export class EnvironmentConfig {
  private config: IEnvironmentConfig | null = null;

  constructor() {
    this.load();
  }

  load(): IEnvironmentConfig {
    if (this.config) {
      return this.config;
    }

    const rawConfig = {
      github: {
        token: process.env.GITHUB_TOKEN || process.env.DEVPOOL_GITHUB_API_TOKEN || process.env.GH_TOKEN || '',
        owner: process.env.GITHUB_OWNER || process.env.DEVPOOL_OWNER_NAME || 'ubiquity',
        repo: process.env.GITHUB_REPOSITORY_NAME || process.env.DEVPOOL_REPO_NAME || 'devpool-directory',
        defaultBranch: process.env.DEFAULT_BRANCH || 'development',
        apiUrl: process.env.GITHUB_API_URL,
        maxRetries: process.env.GITHUB_MAX_RETRIES 
          ? parseInt(process.env.GITHUB_MAX_RETRIES, 10) 
          : undefined,
        rateLimitBuffer: process.env.GITHUB_RATE_LIMIT_BUFFER 
          ? parseInt(process.env.GITHUB_RATE_LIMIT_BUFFER, 10)
          : undefined
      },
      twitter: {
        enabled: process.env.TWITTER_ENABLED === 'true' || !!process.env.TWITTER_API_KEY,
        apiKey: process.env.TWITTER_API_KEY,
        apiSecret: process.env.TWITTER_API_KEY_SECRET || process.env.TWITTER_API_SECRET,
        accessToken: process.env.TWITTER_ACCESS_TOKEN,
        accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
        bearerToken: process.env.TWITTER_BEARER_TOKEN
      },
      storage: {
        branch: process.env.STORAGE_BRANCH,
        path: process.env.STORAGE_PATH
      },
      sync: {
        intervalMinutes: process.env.SYNC_INTERVAL_MINUTES 
          ? parseInt(process.env.SYNC_INTERVAL_MINUTES, 10)
          : undefined,
        batchSize: process.env.SYNC_BATCH_SIZE 
          ? parseInt(process.env.SYNC_BATCH_SIZE, 10)
          : undefined,
        enableAutomaticSync: process.env.ENABLE_AUTOMATIC_SYNC !== 'false'
      },
      logging: {
        level: process.env.LOG_LEVEL as any,
        format: process.env.LOG_FORMAT as any,
        outputPath: process.env.LOG_OUTPUT_PATH
      },
      features: {
        enableDuplicateDetection: process.env.ENABLE_DUPLICATE_DETECTION !== 'false',
        enablePriceCalculation: process.env.ENABLE_PRICE_CALCULATION !== 'false',
        enableStatistics: process.env.ENABLE_STATISTICS !== 'false',
        enableNotifications: process.env.ENABLE_NOTIFICATIONS === 'true'
      }
    };

    try {
      this.config = EnvironmentSchema.parse(rawConfig);
      return this.config;
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.warn('Configuration validation warnings:', error.errors);
        // Use defaults for missing values
        this.config = EnvironmentSchema.parse({});
        return this.config;
      }
      throw error;
    }
  }

  get(): IEnvironmentConfig {
    if (!this.config) {
      return this.load();
    }
    return this.config;
  }

  reload(): IEnvironmentConfig {
    this.config = null;
    return this.load();
  }

  validate(): boolean {
    try {
      this.load();
      return true;
    } catch {
      return false;
    }
  }

  getGitHubConfig() {
    return this.get().github;
  }

  getTwitterConfig() {
    return this.get().twitter;
  }

  getStorageConfig() {
    return this.get().storage;
  }

  getSyncConfig() {
    return this.get().sync;
  }

  getLoggingConfig() {
    return this.get().logging;
  }

  getFeaturesConfig() {
    return this.get().features;
  }

  isFeatureEnabled(feature: keyof IEnvironmentConfig['features']): boolean {
    return this.get().features[feature];
  }
}

export const configManager = new EnvironmentConfig();
export default configManager;