import { injectable, inject } from 'inversify';
import { TYPES } from '../../../shared/types';
import { IssueRepository } from '../../../domain/repositories/issue-repository.interface';
import { Logger } from '../../../shared/logger';

export interface UpdateIssueLabelsInput {
  owner: string;
  repo: string;
  issueNumber: number;
  labelsToAdd?: string[];
  labelsToRemove?: string[];
  setLabels?: string[]; // Replace all labels
}

export interface UpdateIssueLabelsOutput {
  success: boolean;
  updatedLabels: string[];
  addedLabels: string[];
  removedLabels: string[];
}

@injectable()
export class UpdateIssueLabelsUseCase {
  constructor(
    @inject(TYPES.IssueRepository) private issueRepository: IssueRepository,
    @inject(TYPES.Logger) private logger: Logger
  ) {}

  async execute(input: UpdateIssueLabelsInput): Promise<UpdateIssueLabelsOutput> {
    this.logger.info('Updating issue labels', {
      owner: input.owner,
      repo: input.repo,
      issueNumber: input.issueNumber,
      labelsToAdd: input.labelsToAdd,
      labelsToRemove: input.labelsToRemove,
      setLabels: input.setLabels
    });

    try {
      // Get current issue to see existing labels
      const issue = await this.issueRepository.findByNumber(
        input.owner,
        input.repo,
        input.issueNumber
      );

      if (!issue) {
        throw new Error(`Issue #${input.issueNumber} not found`);
      }

      const currentLabels = issue.labels.map((l: any) => 
        typeof l === 'string' ? l : l.name
      );

      let updatedLabels: string[] = [];
      let addedLabels: string[] = [];
      let removedLabels: string[] = [];

      if (input.setLabels) {
        // Replace all labels
        updatedLabels = input.setLabels;
        addedLabels = input.setLabels.filter(l => !currentLabels.includes(l));
        removedLabels = currentLabels.filter((l: string) => !input.setLabels!.includes(l));
      } else {
        // Add/remove specific labels
        updatedLabels = [...currentLabels];

        // Remove labels first
        if (input.labelsToRemove) {
          for (const label of input.labelsToRemove) {
            const index = updatedLabels.indexOf(label);
            if (index > -1) {
              updatedLabels.splice(index, 1);
              removedLabels.push(label);
            }
          }
        }

        // Add new labels
        if (input.labelsToAdd) {
          for (const label of input.labelsToAdd) {
            if (!updatedLabels.includes(label)) {
              updatedLabels.push(label);
              addedLabels.push(label);
            }
          }
        }
      }

      // Ensure required labels exist in the repository
      if (addedLabels.length > 0) {
        await this.ensureLabelsExist(input.owner, input.repo, addedLabels);
      }

      // Update the issue with new labels
      await this.issueRepository.update(input.owner, input.repo, input.issueNumber, {
        labels: updatedLabels
      });

      this.logger.info('Successfully updated issue labels', {
        issueNumber: input.issueNumber,
        addedLabels,
        removedLabels,
        updatedLabels
      });

      return {
        success: true,
        updatedLabels,
        addedLabels,
        removedLabels
      };
    } catch (error) {
      this.logger.error('Failed to update issue labels', error);
      throw error;
    }
  }

  private async ensureLabelsExist(owner: string, repo: string, labels: string[]): Promise<void> {
    for (const labelName of labels) {
      try {
        // Try to get the label
        await this.issueRepository.getLabel(owner, repo, labelName);
      } catch (error: any) {
        if (error.status === 404) {
          // Label doesn't exist, create it
          await this.createLabel(owner, repo, labelName);
        } else {
          throw error;
        }
      }
    }
  }

  private async createLabel(owner: string, repo: string, labelName: string): Promise<void> {
    const color = this.getLabelColor(labelName);
    const description = this.getLabelDescription(labelName);

    await this.issueRepository.createLabel(owner, repo, {
      name: labelName,
      color,
      description
    });

    this.logger.info(`Created label "${labelName}" in ${owner}/${repo}`);
  }

  private getLabelColor(labelName: string): string {
    // Determine color based on label type
    if (labelName.startsWith('price:')) {
      return '0e8a16'; // Green for price labels
    }
    if (labelName.startsWith('id:')) {
      return 'fbca04'; // Yellow for ID labels
    }
    if (labelName.toLowerCase().includes('unavailable')) {
      return 'd73a4a'; // Red for unavailable
    }
    if (labelName.toLowerCase().includes('partner')) {
      return '7057ff'; // Purple for partner
    }
    if (labelName.toLowerCase().includes('duplicate')) {
      return 'cfd3d7'; // Gray for duplicate
    }
    
    // Default color
    return '0075ca'; // Blue
  }

  private getLabelDescription(labelName: string): string {
    if (labelName.startsWith('price:')) {
      const price = labelName.replace('price:', '').trim();
      return `Issue with a reward of $${price}`;
    }
    if (labelName.startsWith('id:')) {
      return 'Unique identifier linking to source issue';
    }
    if (labelName.toLowerCase().includes('unavailable')) {
      return 'Issue is currently assigned or unavailable';
    }
    if (labelName.toLowerCase().includes('partner')) {
      return 'Issue from a partner repository';
    }
    if (labelName.toLowerCase().includes('duplicate')) {
      return 'Duplicate issue';
    }
    
    return '';
  }
}