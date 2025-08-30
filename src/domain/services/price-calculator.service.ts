import { injectable } from 'inversify';
import { Issue } from '../entities/issue';
import { IssuePrice } from '../value-objects/issue-price';
import { Label } from '../value-objects/label';

export interface PriceCalculationResult {
  price: IssuePrice;
  priceLabel?: string;
  timeLabel?: string;
  confidence: number;
  source: 'label' | 'body' | 'comment' | 'default';
}

export interface PriceCalculationOptions {
  defaultPrice?: number;
  hourlyRate?: number;
  checkLabels?: boolean;
  checkBody?: boolean;
  checkComments?: boolean;
  currency?: string;
}

@injectable()
export class PriceCalculatorService {
  private static readonly DEFAULT_HOURLY_RATE = 50;
  private static readonly PRICE_PATTERNS = [
    /\$\s*([\d,]+(?:\.\d{2})?)/i,
    /USD\s*([\d,]+(?:\.\d{2})?)/i,
    /€\s*([\d,]+(?:\.\d{2})?)/i,
    /£\s*([\d,]+(?:\.\d{2})?)/i,
    /¥\s*([\d,]+)/i,
    /Price:\s*([\d,]+(?:\.\d{2})?)/i,
    /Bounty:\s*([\d,]+(?:\.\d{2})?)/i,
    /Reward:\s*([\d,]+(?:\.\d{2})?)/i
  ];

  private static readonly TIME_PATTERNS = [
    /(\d+)\s*hours?/i,
    /(\d+)\s*hrs?/i,
    /(\d+)\s*days?/i,
    /(\d+)\s*weeks?/i,
    /Time:\s*(\d+)\s*hours?/i,
    /Estimated:\s*(\d+)\s*hours?/i
  ];

  calculatePrice(
    issue: Issue,
    options: PriceCalculationOptions = {}
  ): PriceCalculationResult {
    const {
      defaultPrice = 0,
      hourlyRate = PriceCalculatorService.DEFAULT_HOURLY_RATE,
      checkLabels = true,
      checkBody = true,
      checkComments = false
    } = options;

    if (checkLabels) {
      const labelResult = this.extractPriceFromLabels(issue.labels, hourlyRate);
      if (labelResult) {
        return labelResult;
      }
    }

    if (checkBody && issue.body) {
      const bodyResult = this.extractPriceFromText(issue.body, hourlyRate);
      if (bodyResult) {
        return {
          ...bodyResult,
          source: 'body'
        };
      }
    }

    if (issue.price && issue.price.value > 0) {
      return {
        price: issue.price,
        confidence: 1,
        source: 'label'
      };
    }

    return {
      price: new IssuePrice(defaultPrice),
      confidence: 0,
      source: 'default'
    };
  }

  private extractPriceFromLabels(
    labels: Label[],
    hourlyRate: number
  ): PriceCalculationResult | null {
    let priceLabel: string | undefined;
    let timeLabel: string | undefined;
    let price: IssuePrice | null = null;

    for (const label of labels) {
      if (label.isPriceLabel()) {
        priceLabel = label.name;
        const extractedPrice = this.extractPriceFromLabel(label.name);
        if (extractedPrice && extractedPrice.value > 0) {
          price = extractedPrice;
        }
      }

      if (label.isTimeLabel()) {
        timeLabel = label.name;
        if (!price) {
          const hours = this.extractTimeFromLabel(label.name);
          if (hours > 0) {
            price = new IssuePrice(hours * hourlyRate);
          }
        }
      }
    }

    if (price && price.value > 0) {
      return {
        price,
        priceLabel,
        timeLabel,
        confidence: 1,
        source: 'label'
      };
    }

    return null;
  }

  private extractPriceFromLabel(label: string): IssuePrice | null {
    for (const pattern of PriceCalculatorService.PRICE_PATTERNS) {
      const match = label.match(pattern);
      if (match) {
        const value = parseFloat(match[1].replace(/,/g, ''));
        if (!isNaN(value) && value > 0) {
          return new IssuePrice(value);
        }
      }
    }
    return null;
  }

  private extractTimeFromLabel(label: string): number {
    for (const pattern of PriceCalculatorService.TIME_PATTERNS) {
      const match = label.match(pattern);
      if (match) {
        const value = parseInt(match[1], 10);
        if (!isNaN(value) && value > 0) {
          if (pattern.source?.includes('day')) {
            return value * 8;
          }
          if (pattern.source?.includes('week')) {
            return value * 40;
          }
          return value;
        }
      }
    }
    return 0;
  }

  private extractPriceFromText(
    text: string,
    hourlyRate: number
  ): Omit<PriceCalculationResult, 'source'> | null {
    for (const pattern of PriceCalculatorService.PRICE_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        const value = parseFloat(match[1].replace(/,/g, ''));
        if (!isNaN(value) && value > 0) {
          return {
            price: new IssuePrice(value),
            confidence: 0.8
          };
        }
      }
    }

    for (const pattern of PriceCalculatorService.TIME_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        const hours = this.extractTimeFromLabel(match[0]);
        if (hours > 0) {
          return {
            price: new IssuePrice(hours * hourlyRate),
            confidence: 0.6
          };
        }
      }
    }

    return null;
  }

  estimatePriceByComplexity(issue: Issue): IssuePrice {
    let complexity = 0;

    const wordCount = (issue.body?.split(/\s+/).length || 0) + 
                     (issue.title.split(/\s+/).length || 0);
    
    if (wordCount > 500) complexity += 3;
    else if (wordCount > 200) complexity += 2;
    else if (wordCount > 50) complexity += 1;

    const hasCodeBlocks = issue.body?.includes('```') || false;
    if (hasCodeBlocks) complexity += 2;

    const hasBugLabel = issue.labels.some(l => 
      l.name.toLowerCase().includes('bug')
    );
    if (hasBugLabel) complexity += 1;

    const hasFeatureLabel = issue.labels.some(l => 
      l.name.toLowerCase().includes('feature') ||
      l.name.toLowerCase().includes('enhancement')
    );
    if (hasFeatureLabel) complexity += 2;

    const hasHighPriorityLabel = issue.labels.some(l => 
      l.name.toLowerCase().includes('high') ||
      l.name.toLowerCase().includes('critical') ||
      l.name.toLowerCase().includes('p0')
    );
    if (hasHighPriorityLabel) complexity += 2;

    const basePrice = 50;
    const complexityMultiplier = Math.max(1, complexity);
    
    return new IssuePrice(basePrice * complexityMultiplier);
  }

  calculateStatistics(issues: Issue[]): {
    total: number;
    average: number;
    median: number;
    min: number;
    max: number;
    distribution: Map<string, number>;
  } {
    const prices = issues
      .map(issue => issue.price.value)
      .filter(price => price > 0)
      .sort((a, b) => a - b);

    if (prices.length === 0) {
      return {
        total: 0,
        average: 0,
        median: 0,
        min: 0,
        max: 0,
        distribution: new Map()
      };
    }

    const total = prices.reduce((sum, price) => sum + price, 0);
    const average = total / prices.length;
    const median = prices.length % 2 === 0
      ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
      : prices[Math.floor(prices.length / 2)];

    const distribution = new Map<string, number>();
    
    for (const price of prices) {
      let bucket: string;
      if (price < 50) bucket = '$0-50';
      else if (price < 100) bucket = '$50-100';
      else if (price < 250) bucket = '$100-250';
      else if (price < 500) bucket = '$250-500';
      else if (price < 1000) bucket = '$500-1000';
      else bucket = '$1000+';
      
      distribution.set(bucket, (distribution.get(bucket) || 0) + 1);
    }

    return {
      total,
      average,
      median,
      min: prices[0],
      max: prices[prices.length - 1],
      distribution
    };
  }
}