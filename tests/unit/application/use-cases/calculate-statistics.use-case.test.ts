import "reflect-metadata";
import { Container } from "inversify";
import { CalculateStatisticsUseCase } from "../../../../src/application/use-cases/calculate-statistics/calculate-statistics.use-case";
import { IssueRepository } from "../../../../src/domain/repositories/issue-repository.interface";
import { PullRequestRepository } from "../../../../src/domain/repositories/pull-request-repository.interface";
import { GitStorageRepository } from "../../../../src/infrastructure/storage/git-storage.repository";
import { Logger } from "../../../../src/shared/logger";
import { TYPES } from "../../../../src/shared/types";

describe("CalculateStatisticsUseCase", () => {
  let container: Container;
  let useCase: CalculateStatisticsUseCase;
  let mockIssueRepository: jest.Mocked<IssueRepository>;
  let mockPullRequestRepository: jest.Mocked<PullRequestRepository>;
  let mockStorageRepository: jest.Mocked<GitStorageRepository>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    container = new Container();

    // Create mocks
    mockIssueRepository = {
      findAll: jest.fn(),
      findByNumber: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      addComment: jest.fn(),
      addLabels: jest.fn(),
      removeLabel: jest.fn(),
      getLabel: jest.fn(),
      createLabel: jest.fn(),
    } as any;

    mockPullRequestRepository = {
      findAll: jest.fn(),
    } as any;

    mockStorageRepository = {
      write: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    };

    // Bind mocks to container
    container.bind(TYPES.IssueRepository).toConstantValue(mockIssueRepository);
    container.bind(TYPES.PullRequestRepository).toConstantValue(mockPullRequestRepository);
    container.bind(TYPES.GitStorageRepository).toConstantValue(mockStorageRepository);
    container.bind(TYPES.Logger).toConstantValue(mockLogger);

    // Create use case
    useCase = new CalculateStatisticsUseCase(mockIssueRepository, mockPullRequestRepository, mockStorageRepository, mockLogger);
  });

  describe("execute", () => {
    it("should calculate statistics for issues and pull requests", async () => {
      // Arrange
      const mockIssues = [
        {
          id: 1,
          number: 1,
          title: "Issue 1",
          state: "open",
          labels: [{ name: "price: 100" }],
          assignees: [{ login: "user1" }],
          user: { login: "creator1" },
          createdAt: new Date(),
        },
        {
          id: 2,
          number: 2,
          title: "Issue 2",
          state: "closed",
          labels: [{ name: "price: 200" }],
          assignees: [],
          user: { login: "creator2" },
          createdAt: new Date(),
        },
        {
          id: 3,
          number: 3,
          title: "Issue 3",
          state: "open",
          labels: [],
          assignees: [{ login: "user2" }],
          user: { login: "creator3" },
          createdAt: new Date(),
        },
      ];

      const mockPullRequests = [
        {
          id: 1,
          number: 1,
          title: "PR 1",
          state: "open",
          merged: false,
          draft: false,
          user: { login: "contributor1" },
          createdAt: new Date(),
        },
        {
          id: 2,
          number: 2,
          title: "PR 2",
          state: "closed",
          merged: true,
          draft: false,
          user: { login: "contributor2" },
          createdAt: new Date(),
        },
      ];

      mockIssueRepository.findAll.mockResolvedValue(mockIssues as any);
      mockPullRequestRepository.findAll.mockResolvedValue(mockPullRequests as any);
      mockStorageRepository.write.mockResolvedValue(undefined);

      // Act
      const result = await useCase.execute({
        owner: "test-owner",
        repo: "test-repo",
        partnerRepos: ["repo1", "repo2"],
      });

      // Assert
      expect(result.statistics).toBeDefined();
      expect(result.statistics.issues.total).toBe(3);
      expect(result.statistics.issues.open).toBe(2);
      expect(result.statistics.issues.closed).toBe(1);
      expect(result.statistics.issues.priced).toBe(2);
      expect(result.statistics.issues.assigned).toBe(2);

      expect(result.statistics.pullRequests.total).toBe(2);
      expect(result.statistics.pullRequests.open).toBe(1);
      expect(result.statistics.pullRequests.closed).toBe(1);
      expect(result.statistics.pullRequests.merged).toBe(1);

      expect(result.statistics.rewards.total).toBe(300);
      expect(result.statistics.rewards.paid).toBe(200);
      expect(result.statistics.rewards.pending).toBe(100);

      expect(result.statistics.partnerRepositories).toBe(2);
      expect(result.savedToStorage).toBe(true);

      expect(mockStorageRepository.write).toHaveBeenCalledWith("devpool-statistics.json", expect.any(Object));
    });

    it("should handle storage failures gracefully", async () => {
      // Arrange
      mockIssueRepository.findAll.mockResolvedValue([]);
      mockPullRequestRepository.findAll.mockResolvedValue([]);
      mockStorageRepository.write.mockRejectedValue(new Error("Storage error"));

      // Act
      const result = await useCase.execute({
        owner: "test-owner",
        repo: "test-repo",
      });

      // Assert
      expect(result.statistics).toBeDefined();
      expect(result.savedToStorage).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith("Failed to save statistics to storage", expect.any(Error));
    });

    it("should categorize rewards by tier correctly", async () => {
      // Arrange
      const mockIssues = [
        {
          state: "open",
          labels: [{ name: "price: 10" }],
          assignees: [],
          user: { login: "user1" },
          createdAt: new Date(),
        }, // micro
        {
          state: "open",
          labels: [{ name: "price: 50" }],
          assignees: [],
          user: { login: "user2" },
          createdAt: new Date(),
        }, // small
        {
          state: "open",
          labels: [{ name: "price: 250" }],
          assignees: [],
          user: { login: "user3" },
          createdAt: new Date(),
        }, // medium
        {
          state: "open",
          labels: [{ name: "price: 750" }],
          assignees: [],
          user: { login: "user4" },
          createdAt: new Date(),
        }, // large
        {
          state: "open",
          labels: [{ name: "price: 2000" }],
          assignees: [],
          user: { login: "user5" },
          createdAt: new Date(),
        }, // xlarge
      ];

      mockIssueRepository.findAll.mockResolvedValue(mockIssues as any);
      mockPullRequestRepository.findAll.mockResolvedValue([]);

      // Act
      const result = await useCase.execute({
        owner: "test-owner",
        repo: "test-repo",
      });

      // Assert
      expect(result.statistics.rewards.byTier).toEqual({
        micro: 1,
        small: 1,
        medium: 1,
        large: 1,
        xlarge: 1,
      });
    });
  });
});
