import { injectable } from 'inversify';
import { Issue } from '../entities/issue';

export interface DuplicateMatch {
  issue: Issue;
  similarity: number;
  matchedFields: string[];
}

export interface DuplicateDetectionOptions {
  threshold?: number;
  checkTitle?: boolean;
  checkBody?: boolean;
  checkLabels?: boolean;
  checkRepository?: boolean;
  fuzzyMatch?: boolean;
}

export interface DuplicateGroup {
  issues: Issue[];
  similarity: number;
  reason: string;
}

@injectable()
export class DuplicateDetectorService {
  private static readonly DEFAULT_THRESHOLD = 0.8;
  private static readonly TITLE_WEIGHT = 0.4;
  private static readonly BODY_WEIGHT = 0.3;
  private static readonly LABELS_WEIGHT = 0.2;
  private static readonly REPO_WEIGHT = 0.1;

  detectDuplicates(
    issue: Issue,
    candidates: Issue[],
    options: DuplicateDetectionOptions = {}
  ): DuplicateMatch[] {
    const {
      threshold = DuplicateDetectorService.DEFAULT_THRESHOLD,
      checkTitle = true,
      checkBody = true,
      checkLabels = true,
      checkRepository = true,
      fuzzyMatch = true
    } = options;

    const matches: DuplicateMatch[] = [];

    for (const candidate of candidates) {
      if (candidate.id === issue.id) {
        continue;
      }

      const matchedFields: string[] = [];
      let totalSimilarity = 0;
      let totalWeight = 0;

      if (checkTitle) {
        const titleSimilarity = fuzzyMatch
          ? this.calculateStringSimilarity(issue.title, candidate.title)
          : issue.title === candidate.title ? 1 : 0;
        
        if (titleSimilarity > 0.7) {
          matchedFields.push('title');
          totalSimilarity += titleSimilarity * DuplicateDetectorService.TITLE_WEIGHT;
        }
        totalWeight += DuplicateDetectorService.TITLE_WEIGHT;
      }

      if (checkBody && issue.body && candidate.body) {
        const bodySimilarity = fuzzyMatch
          ? this.calculateStringSimilarity(issue.body, candidate.body)
          : issue.body === candidate.body ? 1 : 0;
        
        if (bodySimilarity > 0.7) {
          matchedFields.push('body');
          totalSimilarity += bodySimilarity * DuplicateDetectorService.BODY_WEIGHT;
        }
        totalWeight += DuplicateDetectorService.BODY_WEIGHT;
      }

      if (checkLabels) {
        const labelSimilarity = this.calculateLabelSimilarity(
          issue.labels,
          candidate.labels
        );
        
        if (labelSimilarity > 0.5) {
          matchedFields.push('labels');
          totalSimilarity += labelSimilarity * DuplicateDetectorService.LABELS_WEIGHT;
        }
        totalWeight += DuplicateDetectorService.LABELS_WEIGHT;
      }

      if (checkRepository) {
        const repoMatch = 
          issue.organizationName === candidate.organizationName &&
          issue.repositoryName === candidate.repositoryName;
        
        if (repoMatch) {
          matchedFields.push('repository');
          totalSimilarity += DuplicateDetectorService.REPO_WEIGHT;
        }
        totalWeight += DuplicateDetectorService.REPO_WEIGHT;
      }

      const normalizedSimilarity = totalWeight > 0 
        ? totalSimilarity / totalWeight 
        : 0;

      if (normalizedSimilarity >= threshold) {
        matches.push({
          issue: candidate,
          similarity: normalizedSimilarity,
          matchedFields
        });
      }
    }

    return matches.sort((a, b) => b.similarity - a.similarity);
  }

  detectExactDuplicates(issue: Issue, candidates: Issue[]): Issue[] {
    return candidates.filter(candidate => 
      candidate.id !== issue.id &&
      candidate.title === issue.title &&
      candidate.organizationName === issue.organizationName &&
      candidate.repositoryName === issue.repositoryName
    );
  }

  detectCrossSRepositoryDuplicates(
    issue: Issue,
    candidates: Issue[]
  ): DuplicateMatch[] {
    return this.detectDuplicates(issue, candidates, {
      checkRepository: false,
      threshold: 0.9
    });
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    const normalized1 = this.normalizeString(str1);
    const normalized2 = this.normalizeString(str2);
    
    if (normalized1 === normalized2) return 1;
    
    const distance = this.levenshteinDistance(normalized1, normalized2);
    const maxLength = Math.max(normalized1.length, normalized2.length);
    
    return maxLength === 0 ? 1 : 1 - (distance / maxLength);
  }

  private calculateLabelSimilarity(labels1: any[], labels2: any[]): number {
    if (labels1.length === 0 && labels2.length === 0) return 1;
    if (labels1.length === 0 || labels2.length === 0) return 0;
    
    const set1 = new Set(labels1.map(l => l.name.toLowerCase()));
    const set2 = new Set(labels2.map(l => l.name.toLowerCase()));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  private normalizeString(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  groupDuplicates(issues: Issue[]): Map<string, Issue[]> {
    const groups = new Map<string, Issue[]>();
    const processed = new Set<string>();
    
    for (const issue of issues) {
      if (processed.has(issue.id)) {
        continue;
      }
      
      const duplicates = this.detectDuplicates(issue, issues, {
        threshold: 0.9
      });
      
      if (duplicates.length > 0) {
        const groupKey = issue.id;
        const group = [issue, ...duplicates.map(d => d.issue)];
        
        groups.set(groupKey, group);
        group.forEach(i => processed.add(i.id));
      }
    }
    
    return groups;
  }

  // Additional methods for compatibility with tests
  calculateSimilarity(issue1: Issue | any, issue2: Issue | any): number {
    const titleSim = this.calculateStringSimilarity(issue1.title || '', issue2.title || '');
    const bodySim = this.calculateStringSimilarity(issue1.body || '', issue2.body || '');
    
    return (titleSim * 0.6 + bodySim * 0.4);
  }

  isDuplicate(issue1: Issue | any, issue2: Issue | any, threshold: number = 0.8): boolean {
    // Check for same node ID label first
    if (issue1.labels && issue2.labels) {
      const nodeId1 = issue1.labels.find((l: any) => l.name?.startsWith('id:'))?.name;
      const nodeId2 = issue2.labels.find((l: any) => l.name?.startsWith('id:'))?.name;
      
      if (nodeId1 && nodeId2 && nodeId1 === nodeId2) {
        return true;
      }
    }
    
    return this.calculateSimilarity(issue1, issue2) >= threshold;
  }

  findDuplicates(issues: (Issue | any)[], threshold: number = 0.8): DuplicateGroup[] {
    const groups: DuplicateGroup[] = [];
    const processed = new Set<number>();
    
    for (let i = 0; i < issues.length; i++) {
      if (processed.has(i)) continue;
      
      const group: Issue[] = [issues[i]];
      processed.add(i);
      
      for (let j = i + 1; j < issues.length; j++) {
        if (processed.has(j)) continue;
        
        if (this.isDuplicate(issues[i], issues[j], threshold)) {
          group.push(issues[j]);
          processed.add(j);
        }
      }
      
      if (group.length > 1) {
        groups.push({
          issues: group,
          similarity: 1.0,
          reason: 'Similar title and body content'
        });
      }
    }
    
    return groups;
  }
}