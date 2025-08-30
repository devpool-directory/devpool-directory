import 'reflect-metadata';
import { DuplicateDetectorService } from '../../../../src/domain/services/duplicate-detector.service';
import { Issue } from '../../../../src/domain/entities/issue';

describe('DuplicateDetectorService', () => {
  let service: DuplicateDetectorService;

  beforeEach(() => {
    service = new DuplicateDetectorService();
  });

  describe('calculateSimilarity', () => {
    it('should return 1.0 for identical issues', () => {
      const issue1 = new Issue({
        id: 1,
        nodeId: 'node1',
        number: 1,
        title: 'Test Issue',
        body: 'This is a test issue body',
        state: 'open',
        createdAt: new Date(),
        updatedAt: new Date(),
        labels: [],
        assignees: [],
        user: { login: 'user1', id: 1, nodeId: 'usernode1', avatarUrl: '', type: 'User' },
        htmlUrl: 'https://github.com/test/repo/issues/1'
      });

      const issue2 = new Issue({
        id: 2,
        nodeId: 'node2',
        number: 2,
        title: 'Test Issue',
        body: 'This is a test issue body',
        state: 'open',
        createdAt: new Date(),
        updatedAt: new Date(),
        labels: [],
        assignees: [],
        user: { login: 'user1', id: 1, nodeId: 'usernode1', avatarUrl: '', type: 'User' },
        htmlUrl: 'https://github.com/test/repo/issues/2'
      });

      const similarity = service.calculateSimilarity(issue1, issue2);
      expect(similarity).toBe(1.0);
    });

    it('should return 0.0 for completely different issues', () => {
      const issue1 = new Issue({
        id: 1,
        nodeId: 'node1',
        number: 1,
        title: 'First Issue',
        body: 'This is the first issue',
        state: 'open',
        createdAt: new Date(),
        updatedAt: new Date(),
        labels: [],
        assignees: [],
        user: { login: 'user1', id: 1, nodeId: 'usernode1', avatarUrl: '', type: 'User' },
        htmlUrl: 'https://github.com/test/repo/issues/1'
      });

      const issue2 = new Issue({
        id: 2,
        nodeId: 'node2',
        number: 2,
        title: 'Completely Different Topic',
        body: 'Unrelated content here',
        state: 'open',
        createdAt: new Date(),
        updatedAt: new Date(),
        labels: [],
        assignees: [],
        user: { login: 'user2', id: 2, nodeId: 'usernode2', avatarUrl: '', type: 'User' },
        htmlUrl: 'https://github.com/test/repo/issues/2'
      });

      const similarity = service.calculateSimilarity(issue1, issue2);
      expect(similarity).toBeLessThan(0.5);
    });

    it('should return high similarity for issues with same node ID label', () => {
      const issue1 = new Issue({
        id: 1,
        nodeId: 'node1',
        number: 1,
        title: 'Issue 1',
        body: 'Body 1',
        state: 'open',
        createdAt: new Date(),
        updatedAt: new Date(),
        labels: [{ name: 'id:source123', color: 'yellow' }],
        assignees: [],
        user: { login: 'user1', id: 1, nodeId: 'usernode1', avatarUrl: '', type: 'User' },
        htmlUrl: 'https://github.com/test/repo/issues/1'
      });

      const issue2 = new Issue({
        id: 2,
        nodeId: 'node2',
        number: 2,
        title: 'Different Title',
        body: 'Different Body',
        state: 'open',
        createdAt: new Date(),
        updatedAt: new Date(),
        labels: [{ name: 'id:source123', color: 'yellow' }],
        assignees: [],
        user: { login: 'user2', id: 2, nodeId: 'usernode2', avatarUrl: '', type: 'User' },
        htmlUrl: 'https://github.com/test/repo/issues/2'
      });

      const areDuplicates = service.isDuplicate(issue1, issue2);
      expect(areDuplicates).toBe(true);
    });
  });

  describe('isDuplicate', () => {
    it('should detect duplicates based on threshold', () => {
      const issue1 = new Issue({
        id: 1,
        nodeId: 'node1',
        number: 1,
        title: 'Fix bug in authentication',
        body: 'The login function is broken',
        state: 'open',
        createdAt: new Date(),
        updatedAt: new Date(),
        labels: [],
        assignees: [],
        user: { login: 'user1', id: 1, nodeId: 'usernode1', avatarUrl: '', type: 'User' },
        htmlUrl: 'https://github.com/test/repo/issues/1'
      });

      const issue2 = new Issue({
        id: 2,
        nodeId: 'node2',
        number: 2,
        title: 'Fix authentication bug',
        body: 'Login function is not working',
        state: 'open',
        createdAt: new Date(),
        updatedAt: new Date(),
        labels: [],
        assignees: [],
        user: { login: 'user2', id: 2, nodeId: 'usernode2', avatarUrl: '', type: 'User' },
        htmlUrl: 'https://github.com/test/repo/issues/2'
      });

      const areDuplicates = service.isDuplicate(issue1, issue2, 0.7);
      expect(areDuplicates).toBe(true);
    });
  });

  describe('findDuplicates', () => {
    it('should find all duplicates in a list of issues', () => {
      const issues = [
        new Issue({
          id: 1,
          nodeId: 'node1',
          number: 1,
          title: 'Bug Report',
          body: 'Application crashes on startup',
          state: 'open',
          createdAt: new Date(),
          updatedAt: new Date(),
          labels: [],
          assignees: [],
          user: { login: 'user1', id: 1, nodeId: 'usernode1', avatarUrl: '', type: 'User' },
          htmlUrl: 'https://github.com/test/repo/issues/1'
        }),
        new Issue({
          id: 2,
          nodeId: 'node2',
          number: 2,
          title: 'App crashes on start',
          body: 'The application crashes when starting up',
          state: 'open',
          createdAt: new Date(),
          updatedAt: new Date(),
          labels: [],
          assignees: [],
          user: { login: 'user2', id: 2, nodeId: 'usernode2', avatarUrl: '', type: 'User' },
          htmlUrl: 'https://github.com/test/repo/issues/2'
        }),
        new Issue({
          id: 3,
          nodeId: 'node3',
          number: 3,
          title: 'Feature Request',
          body: 'Add dark mode support',
          state: 'open',
          createdAt: new Date(),
          updatedAt: new Date(),
          labels: [],
          assignees: [],
          user: { login: 'user3', id: 3, nodeId: 'usernode3', avatarUrl: '', type: 'User' },
          htmlUrl: 'https://github.com/test/repo/issues/3'
        })
      ];

      const duplicates = service.findDuplicates(issues, 0.7);
      
      expect(duplicates.length).toBe(1);
      expect(duplicates[0].issues.length).toBe(2);
      expect(duplicates[0].issues[0].number).toBe(1);
      expect(duplicates[0].issues[1].number).toBe(2);
    });
  });
});