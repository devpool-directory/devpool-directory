import { injectable, inject } from "inversify";
import { TYPES } from "../../shared/types";
import { GitHubClient } from "../github/github-client";
import { Logger } from "../../shared/logger";

export interface StorageData {
  issues?: any[];
  pullRequests?: any[];
  statistics?: any;
  twitterMap?: Map<string, string>;
  [key: string]: any;
}

@injectable()
export class GitStorageRepository {
  private static readonly STORAGE_BRANCH = "__STORAGE__";
  private static readonly MAX_PAYLOAD_SIZE = 100 * 1024 * 1024; // 100MB

  constructor(
    @inject(TYPES.GitHubClient) private githubClient: GitHubClient,
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.Config) private config: any
  ) {}

  async read(filename: string): Promise<any> {
    try {
      const { data } = await this.githubClient.rest.repos.getContent({
        owner: this.config.github.owner,
        repo: this.config.github.repo,
        path: filename,
        ref: GitStorageRepository.STORAGE_BRANCH,
      });

      if ("content" in data && typeof data.content === "string") {
        const content = Buffer.from(data.content, "base64").toString("utf-8");
        return JSON.parse(content);
      }

      return null;
    } catch (error: any) {
      if (error.status === 404) {
        this.logger.warn(`File ${filename} not found in storage branch`);
        return null;
      }
      this.logger.error(`Failed to read ${filename} from storage`, error);
      throw error;
    }
  }

  async write(filename: string, data: any): Promise<void> {
    const content = JSON.stringify(data, null, 2);
    const contentBase64 = Buffer.from(content).toString("base64");

    try {
      await this.ensureStorageBranch();

      let sha: string | undefined;
      try {
        const existing = await this.githubClient.rest.repos.getContent({
          owner: this.config.github.owner,
          repo: this.config.github.repo,
          path: filename,
          ref: GitStorageRepository.STORAGE_BRANCH,
        });

        if ("sha" in existing.data) {
          sha = existing.data.sha;
        }
      } catch (error: any) {
        if (error.status !== 404) {
          throw error;
        }
      }

      if (contentBase64.length > GitStorageRepository.MAX_PAYLOAD_SIZE) {
        await this.writeLargeFile(filename, content);
      } else {
        await this.githubClient.rest.repos.createOrUpdateFileContents({
          owner: this.config.github.owner,
          repo: this.config.github.repo,
          path: filename,
          message: `Update ${filename}`,
          content: contentBase64,
          branch: GitStorageRepository.STORAGE_BRANCH,
          sha,
        });
      }

      this.logger.info(`Successfully wrote ${filename} to storage`);
    } catch (error) {
      this.logger.error(`Failed to write ${filename} to storage`, error);
      throw error;
    }
  }

  async writeMultiple(files: Map<string, any>): Promise<void> {
    try {
      await this.ensureStorageBranch();

      const tree: any[] = [];
      for (const [filename, data] of files) {
        const content = JSON.stringify(data, null, 2);
        tree.push({
          path: filename,
          mode: "100644",
          type: "blob",
          content,
        });
      }

      const { data: treeData } = await this.githubClient.rest.git.createTree({
        owner: this.config.github.owner,
        repo: this.config.github.repo,
        tree,
      });

      const { data: refData } = await this.githubClient.rest.git.getRef({
        owner: this.config.github.owner,
        repo: this.config.github.repo,
        ref: `heads/${GitStorageRepository.STORAGE_BRANCH}`,
      });

      const { data: commitData } = await this.githubClient.rest.git.createCommit({
        owner: this.config.github.owner,
        repo: this.config.github.repo,
        message: "Update multiple storage files",
        tree: treeData.sha,
        parents: [refData.object.sha],
      });

      await this.githubClient.rest.git.updateRef({
        owner: this.config.github.owner,
        repo: this.config.github.repo,
        ref: `heads/${GitStorageRepository.STORAGE_BRANCH}`,
        sha: commitData.sha,
      });

      this.logger.info(`Successfully wrote ${files.size} files to storage`);
    } catch (error) {
      this.logger.error("Failed to write multiple files to storage", error);
      throw error;
    }
  }

  async delete(filename: string): Promise<void> {
    try {
      const { data } = await this.githubClient.rest.repos.getContent({
        owner: this.config.github.owner,
        repo: this.config.github.repo,
        path: filename,
        ref: GitStorageRepository.STORAGE_BRANCH,
      });

      if ("sha" in data) {
        await this.githubClient.rest.repos.deleteFile({
          owner: this.config.github.owner,
          repo: this.config.github.repo,
          path: filename,
          message: `Delete ${filename}`,
          sha: data.sha,
          branch: GitStorageRepository.STORAGE_BRANCH,
        });

        this.logger.info(`Successfully deleted ${filename} from storage`);
      }
    } catch (error: any) {
      if (error.status === 404) {
        this.logger.warn(`File ${filename} not found in storage branch`);
        return;
      }
      this.logger.error(`Failed to delete ${filename} from storage`, error);
      throw error;
    }
  }

  async list(path: string = ""): Promise<string[]> {
    try {
      const { data } = await this.githubClient.rest.repos.getContent({
        owner: this.config.github.owner,
        repo: this.config.github.repo,
        path,
        ref: GitStorageRepository.STORAGE_BRANCH,
      });

      if (Array.isArray(data)) {
        return data.filter((item) => item.type === "file").map((item) => item.path);
      }

      return [];
    } catch (error: any) {
      if (error.status === 404) {
        return [];
      }
      this.logger.error("Failed to list storage files", error);
      throw error;
    }
  }

  private async ensureStorageBranch(): Promise<void> {
    try {
      await this.githubClient.rest.repos.getBranch({
        owner: this.config.github.owner,
        repo: this.config.github.repo,
        branch: GitStorageRepository.STORAGE_BRANCH,
      });
    } catch (error: any) {
      if (error.status === 404) {
        await this.createStorageBranch();
      } else {
        throw error;
      }
    }
  }

  private async createStorageBranch(): Promise<void> {
    try {
      const { data: defaultBranch } = await this.githubClient.rest.repos.getBranch({
        owner: this.config.github.owner,
        repo: this.config.github.repo,
        branch: this.config.github.defaultBranch || "main",
      });

      await this.githubClient.rest.git.createRef({
        owner: this.config.github.owner,
        repo: this.config.github.repo,
        ref: `refs/heads/${GitStorageRepository.STORAGE_BRANCH}`,
        sha: defaultBranch.commit.sha,
      });

      this.logger.info("Created storage branch");
    } catch (error) {
      this.logger.error("Failed to create storage branch", error);
      throw error;
    }
  }

  private async writeLargeFile(filename: string, content: string): Promise<void> {
    const chunks = this.splitIntoChunks(content, 50 * 1024 * 1024); // 50MB chunks
    const chunkFiles = new Map<string, any>();

    for (let i = 0; i < chunks.length; i++) {
      chunkFiles.set(`${filename}.${i}`, { chunk: i, total: chunks.length, data: chunks[i] });
    }

    await this.writeMultiple(chunkFiles);

    chunkFiles.set(filename, {
      type: "chunked",
      chunks: chunks.length,
      files: Array.from({ length: chunks.length }, (_, i) => `${filename}.${i}`),
    });

    await this.write(filename, chunkFiles.get(filename));
  }

  private splitIntoChunks(str: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < str.length; i += chunkSize) {
      chunks.push(str.slice(i, i + chunkSize));
    }
    return chunks;
  }

  async readChunkedFile(filename: string): Promise<any> {
    const metadata = await this.read(filename);

    if (metadata?.type !== "chunked") {
      return metadata;
    }

    const chunks: string[] = [];
    for (const chunkFile of metadata.files) {
      const chunkData = await this.read(chunkFile);
      chunks.push(chunkData.data);
    }

    const fullContent = chunks.join("");
    return JSON.parse(fullContent);
  }
}
