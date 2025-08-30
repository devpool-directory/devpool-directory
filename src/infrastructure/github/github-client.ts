import { injectable, inject } from 'inversify';
import { Octokit } from '@octokit/rest';
import { TYPES } from '../../shared/types';
import { ExternalServiceError, RateLimitError } from '../../shared/errors/base.error';

export interface GitHubClientConfig {
  token: string;
  apiUrl?: string;
  maxRetries?: number;
  rateLimitBuffer?: number;
}

@injectable()
export class GitHubClient {
  public readonly rest: Octokit;
  private octokit: Octokit;
  private rateLimitRemaining: number = 5000;
  private rateLimitReset: Date = new Date();

  constructor(@inject(TYPES.Config) config: any) {
    const githubConfig = config.github;
    this.config = githubConfig;
    
    const OctokitWithPlugins = Octokit;
    
    this.octokit = new OctokitWithPlugins({
      auth: githubConfig.token,
      baseUrl: githubConfig.apiUrl || 'https://api.github.com',
      throttle: {
        onRateLimit: (retryAfter: number, options: any) => {
          console.warn(
            `Request quota exhausted for request ${options.method} ${options.url}`
          );
          
          if (options.request.retryCount === 0) {
            console.log(`Retrying after ${retryAfter} seconds!`);
            return true;
          }
        },
        onAbuseLimit: (retryAfter: number, options: any) => {
          console.warn(
            `Abuse detected for request ${options.method} ${options.url}`
          );
        }
      },
      retry: {
        doNotRetry: ['429'],
        retries: githubConfig.maxRetries || 3
      }
    });

    this.rest = this.octokit;
    this.setupRateLimitTracking();
  }

  private setupRateLimitTracking() {
    this.octokit.hook.after('request', async (response: any) => {
      const remaining = response.headers['x-ratelimit-remaining'];
      const reset = response.headers['x-ratelimit-reset'];
      
      if (remaining !== undefined) {
        this.rateLimitRemaining = parseInt(remaining, 10);
      }
      
      if (reset !== undefined) {
        this.rateLimitReset = new Date(parseInt(reset, 10) * 1000);
      }
    });
  }

  async checkRateLimit(): Promise<void> {
    const buffer = this.config.rateLimitBuffer || 100;
    
    if (this.rateLimitRemaining < buffer) {
      const now = new Date();
      const resetTime = this.rateLimitReset;
      
      if (resetTime > now) {
        const waitTime = resetTime.getTime() - now.getTime();
        throw new RateLimitError(
          `Rate limit buffer reached. Reset at ${resetTime.toISOString()}`,
          Math.ceil(waitTime / 1000)
        );
      }
    }
  }

  async request<T = any>(
    route: string,
    parameters?: any
  ): Promise<T> {
    try {
      await this.checkRateLimit();
      
      const response = await this.octokit.request(route, parameters);
      return response.data as T;
    } catch (error: any) {
      this.handleError(error);
    }
  }

  async paginate<T = any>(
    route: string,
    parameters?: any
  ): Promise<T[]> {
    try {
      await this.checkRateLimit();
      
      const results = await this.octokit.paginate(route, parameters);
      return results as T[];
    } catch (error: any) {
      this.handleError(error);
    }
  }

  private handleError(error: any): never {
    if (error.status === 401) {
      throw new ExternalServiceError(
        'GitHub',
        'Authentication failed. Please check your GitHub token.',
        401
      );
    }
    
    if (error.status === 403) {
      throw new ExternalServiceError(
        'GitHub',
        'Access forbidden. You may not have permission to access this resource.',
        403
      );
    }
    
    if (error.status === 404) {
      throw new ExternalServiceError(
        'GitHub',
        'Resource not found.',
        404
      );
    }
    
    if (error.status === 422) {
      throw new ExternalServiceError(
        'GitHub',
        'Validation failed.',
        422,
        { errors: error.errors }
      );
    }
    
    if (error.status === 429) {
      const resetTime = error.headers?.['x-ratelimit-reset'];
      const retryAfter = resetTime 
        ? Math.ceil((parseInt(resetTime, 10) * 1000 - Date.now()) / 1000)
        : 60;
      
      throw new RateLimitError(
        'GitHub API rate limit exceeded',
        retryAfter
      );
    }
    
    throw new ExternalServiceError(
      'GitHub',
      error.message || 'An unexpected error occurred',
      error.status,
      { originalError: error }
    );
  }

  getOctokit(): Octokit {
    return this.octokit;
  }

  getRateLimitInfo() {
    return {
      remaining: this.rateLimitRemaining,
      reset: this.rateLimitReset
    };
  }
}