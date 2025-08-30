import { injectable, inject } from 'inversify';
import { TYPES } from '../../../shared/types';
import { IssueRepository } from '../../../domain/repositories/issue-repository.interface';
import { DuplicateDetectorService } from '../../../domain/services/duplicate-detector.service';
import { Logger } from '../../../shared/logger';

export interface DetectDuplicatesInput {
  owner: string;
  repo: string;
  dryRun?: boolean;
  threshold?: number;
}

export interface DuplicateGroup {
  originalNodeId: string;
  originalIssue: any;
  duplicates: Array<{
    nodeId: string;
    issue: any;
    similarity: number;
  }>;
}

export interface DetectDuplicatesOutput {
  duplicateGroups: DuplicateGroup[];
  totalDuplicates: number;
  processedIssues: number;
  closedDuplicates: number;
}

@injectable()
export class DetectDuplicatesUseCase {
  constructor(
    @inject(TYPES.IssueRepository) private issueRepository: IssueRepository,
    @inject(TYPES.DuplicateDetectorService) private duplicateDetector: DuplicateDetectorService,
    @inject(TYPES.Logger) private logger: Logger
  ) {}

  async execute(input: DetectDuplicatesInput): Promise<DetectDuplicatesOutput> {
    this.logger.info('Starting duplicate detection', {
      owner: input.owner,
      repo: input.repo,
      dryRun: input.dryRun
    });

    try {
      // Fetch all open issues
      const issues = await this.issueRepository.findAll(input.owner, input.repo, {
        state: 'open',
        perPage: 100
      });

      this.logger.info(`Fetched ${issues.length} open issues for duplicate detection`);

      // Group issues by their source repository (using labels)
      const issuesBySource = new Map<string, any[]>();
      
      for (const issue of issues) {
        const sourceNodeId = this.extractSourceNodeId(issue.labels);
        if (sourceNodeId) {
          const group = issuesBySource.get(sourceNodeId) || [];
          group.push(issue);
          issuesBySource.set(sourceNodeId, group);
        }
      }

      // Find duplicate groups
      const duplicateGroups: DuplicateGroup[] = [];
      let totalDuplicates = 0;
      let closedDuplicates = 0;

      for (const [sourceNodeId, groupIssues] of issuesBySource) {
        if (groupIssues.length > 1) {
          // Sort by creation date to find the original
          groupIssues.sort((a, b) => 
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );

          const original = groupIssues[0];
          const duplicates = groupIssues.slice(1);

          duplicateGroups.push({
            originalNodeId: sourceNodeId,
            originalIssue: original,
            duplicates: duplicates.map(dup => ({
              nodeId: dup.nodeId,
              issue: dup,
              similarity: 1.0 // Exact match based on source node ID
            }))
          });

          totalDuplicates += duplicates.length;

          // Close duplicates if not in dry run mode
          if (!input.dryRun) {
            for (const duplicate of duplicates) {
              try {
                await this.closeDuplicateIssue(
                  input.owner,
                  input.repo,
                  duplicate.number,
                  original.number
                );
                closedDuplicates++;
              } catch (error) {
                this.logger.error('Failed to close duplicate issue', {
                  issueNumber: duplicate.number,
                  error
                });
              }
            }
          }
        }
      }

      // Also check for title/body similarity if threshold is provided
      if (input.threshold) {
        const similarityGroups = await this.findSimilarIssues(
          issues,
          input.threshold
        );
        
        // Merge with existing groups
        for (const group of similarityGroups) {
          const existingGroup = duplicateGroups.find(g => 
            g.originalNodeId === group.originalNodeId
          );
          
          if (existingGroup) {
            // Merge duplicates
            for (const dup of group.duplicates) {
              if (!existingGroup.duplicates.some(d => d.nodeId === dup.nodeId)) {
                existingGroup.duplicates.push(dup);
                totalDuplicates++;
              }
            }
          } else {
            duplicateGroups.push(group);
            totalDuplicates += group.duplicates.length;
          }
        }
      }

      this.logger.info('Duplicate detection completed', {
        groups: duplicateGroups.length,
        totalDuplicates,
        closedDuplicates
      });

      return {
        duplicateGroups,
        totalDuplicates,
        processedIssues: issues.length,
        closedDuplicates
      };
    } catch (error) {
      this.logger.error('Failed to detect duplicates', error);
      throw error;
    }
  }

  private extractSourceNodeId(labels: any[]): string | null {
    const idLabel = labels.find(label => 
      label.name && label.name.startsWith('id:')
    );
    
    if (idLabel) {
      return idLabel.name.replace('id:', '').trim();
    }
    
    return null;
  }

  private async findSimilarIssues(
    issues: any[],
    threshold: number
  ): Promise<DuplicateGroup[]> {
    const groups: DuplicateGroup[] = [];
    const processed = new Set<string>();

    for (let i = 0; i < issues.length; i++) {
      const issue1 = issues[i];
      
      if (processed.has(issue1.nodeId)) {
        continue;
      }

      const duplicates: any[] = [];

      for (let j = i + 1; j < issues.length; j++) {
        const issue2 = issues[j];
        
        if (processed.has(issue2.nodeId)) {
          continue;
        }

        const similarity = this.duplicateDetector.calculateSimilarity(
          issue1,
          issue2
        );

        if (similarity >= threshold) {
          duplicates.push({
            nodeId: issue2.nodeId,
            issue: issue2,
            similarity
          });
          processed.add(issue2.nodeId);
        }
      }

      if (duplicates.length > 0) {
        groups.push({
          originalNodeId: issue1.nodeId,
          originalIssue: issue1,
          duplicates
        });
        processed.add(issue1.nodeId);
      }
    }

    return groups;
  }

  private async closeDuplicateIssue(
    owner: string,
    repo: string,
    duplicateNumber: number,
    originalNumber: number
  ): Promise<void> {
    const comment = `This issue has been identified as a duplicate of #${originalNumber} and will be closed to maintain a clean issue tracker.`;

    await this.issueRepository.addComment(owner, repo, duplicateNumber, comment);
    await this.issueRepository.update(owner, repo, duplicateNumber, {
      state: 'closed',
      stateReason: 'not_planned'
    });

    this.logger.info(`Closed duplicate issue #${duplicateNumber} (duplicate of #${originalNumber})`);
  }
}