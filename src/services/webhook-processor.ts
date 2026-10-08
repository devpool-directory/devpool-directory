import { Contributor } from '../types/contributor';

export class WebhookProcessor {
  async processEvent(payload: any, contributor: Contributor): Promise<boolean> {
    if (!this.hasRequiredRole(contributor)) {
      console.error(`Contributor ${contributor.id} does not have sufficient permissions.`);
      return false;
    }

    // Lógica de processamento de recompensa v2
    return await this.triggerReward(contributor, payload);
  }

  private hasRequiredRole(contributor: Contributor): boolean {
    const roles = ['contributor', 'maintainer', 'admin'];
    return roles.includes(contributor.role);
  }

  private async triggerReward(contributor: Contributor, payload: any): Promise<boolean> {
    // Integração com o sistema de pagamentos/recompensas
    console.log(`Processing reward for ${contributor.githubId}`);
    return true;
  }
}
