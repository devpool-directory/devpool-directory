// Import necessary modules
import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';

// Define configuration types
interface RpcNodeConfig {
  url: string;
  isActive: boolean;
}

interface RpcFailoverConfig {
  nodes: RpcNodeConfig[];
  retryAttempts: number;
  timeout: number;
  healthCheckInterval: number;
}

// Define failover class
class RpcFailover extends EventEmitter {
  private nodes: RpcNodeConfig[];
  private currentNodeIndex: number = 0;
  private retryAttempts: number;
  private timeout: number;
  private healthCheckInterval: number;
  private axiosInstance: AxiosInstance;
  private healthCheckIntervalId?: NodeJS.Timeout;

  constructor(config: RpcFailoverConfig) {
    super();
    this.nodes = config.nodes;
    this.retryAttempts = config.retryAttempts;
    this.timeout = config.timeout;
    this.healthCheckInterval = config.healthCheckInterval;
    this.axiosInstance = axios.create({
      timeout: this.timeout
    });
    this.startHealthChecks();
  }

  // Start periodic health checks for nodes
  private startHealthChecks(): void {
    this.healthCheckIntervalId = setInterval(this.checkNodeHealth.bind(this), this.healthCheckInterval);
  }

  // Stop health checks
  private stopHealthChecks(): void {
    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
    }
  }

  // Check the health of all nodes
  private checkNodeHealth(): void {
    this.nodes.forEach((node, index) => {
      if (node.isActive) {
        this.checkNode(node, index);
      }
    });
  }

  // Make a request to a node and update its health status
  private async checkNode(node: RpcNodeConfig, index: number): Promise<void> {
    try {
      await this.axiosInstance.get(node.url);
      this.nodes[index].isActive = true;
    } catch (error) {
      this.nodes[index].isActive = false;
      this.emit('node-down', node.url);
    }
  }

  // Try to make a request to the current node, and failover if necessary
  private async makeRequest(url: string): Promise<any> {
    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      const currentNode = this.nodes[this.currentNodeIndex];
      try {
        const response = await this.axiosInstance.get(currentNode.url + url);
        return response.data;
      } catch (error) {
        if (attempt < this.retryAttempts - 1) {
          this.switchToNextNode();
        } else {
          throw new Error('RPC request failed after retries');
        }
      }
    }
  }

  // Switch to the next active node
  private switchToNextNode(): void {
    let nextNodeIndex = this.currentNodeIndex + 1;
    if (nextNodeIndex >= this.nodes.length) {
      nextNodeIndex = 0;
    }
    this.currentNodeIndex = nextNodeIndex;
  }

  // Public method to initiate RPC requests
  public async rpcRequest(url: string): Promise<any> {
    return this.makeRequest(url);
  }

  // Stop the failover mechanism and health checks
  public stop(): void {
    this.stopHealthChecks();
  }
}

// Export the failover mechanism
export { RpcFailover };