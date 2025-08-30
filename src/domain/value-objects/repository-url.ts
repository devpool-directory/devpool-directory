export class RepositoryUrl {
  private static readonly GITHUB_PATTERN = /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)(?:\/.*)?$/;
  
  private readonly _owner: string;
  private readonly _name: string;
  private readonly _url: string;

  constructor(url: string) {
    const normalized = this.normalizeUrl(url);
    const match = RepositoryUrl.GITHUB_PATTERN.exec(normalized);
    
    if (!match) {
      throw new Error(`Invalid GitHub repository URL: ${url}`);
    }
    
    this._owner = match[1];
    this._name = match[2].replace(/\.git$/, '');
    this._url = `https://github.com/${this._owner}/${this._name}`;
  }

  static fromOwnerAndName(owner: string, name: string): RepositoryUrl {
    return new RepositoryUrl(`https://github.com/${owner}/${name}`);
  }

  static fromFullName(fullName: string): RepositoryUrl {
    const parts = fullName.split('/');
    
    if (parts.length !== 2) {
      throw new Error(`Invalid repository full name: ${fullName}`);
    }
    
    return RepositoryUrl.fromOwnerAndName(parts[0], parts[1]);
  }

  private normalizeUrl(url: string): string {
    let normalized = url.trim();
    
    if (!normalized.startsWith('http')) {
      normalized = `https://${normalized}`;
    }
    
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    
    return normalized;
  }

  get owner(): string {
    return this._owner;
  }

  get name(): string {
    return this._name;
  }

  get url(): string {
    return this._url;
  }

  get fullName(): string {
    return `${this._owner}/${this._name}`;
  }

  get apiUrl(): string {
    return `https://api.github.com/repos/${this._owner}/${this._name}`;
  }

  get cloneUrl(): string {
    return `${this._url}.git`;
  }

  getIssuesUrl(state?: 'open' | 'closed' | 'all'): string {
    const stateParam = state ? `?state=${state}` : '';
    return `${this._url}/issues${stateParam}`;
  }

  getIssueUrl(issueNumber: number): string {
    return `${this._url}/issues/${issueNumber}`;
  }

  getPullRequestUrl(prNumber: number): string {
    return `${this._url}/pull/${prNumber}`;
  }

  equals(other: RepositoryUrl): boolean {
    return this._url === other._url;
  }

  toString(): string {
    return this._url;
  }
}