export class IssuePrice {
  private static readonly MIN_PRICE = 0;
  private static readonly MAX_PRICE = 1000000;

  constructor(private readonly _value: number) {
    if (_value < IssuePrice.MIN_PRICE) {
      throw new Error(`Price cannot be negative: ${_value}`);
    }
    if (_value > IssuePrice.MAX_PRICE) {
      throw new Error(`Price exceeds maximum allowed: ${_value}`);
    }
  }

  static fromString(priceString: string): IssuePrice {
    const cleanedString = priceString.replace(/[^0-9.-]/g, '');
    const value = parseFloat(cleanedString);
    
    if (isNaN(value)) {
      return new IssuePrice(0);
    }
    
    return new IssuePrice(value);
  }

  static fromLabel(label: string): IssuePrice {
    const priceMatch = label.match(/Price:\s*[\$€£¥]?\s*([\d,]+(?:\.\d{2})?)/i);
    
    if (!priceMatch) {
      return new IssuePrice(0);
    }
    
    const priceString = priceMatch[1].replace(/,/g, '');
    return IssuePrice.fromString(priceString);
  }

  static zero(): IssuePrice {
    return new IssuePrice(0);
  }

  get value(): number {
    return this._value;
  }

  get formatted(): string {
    return `$${this._value.toFixed(2)}`;
  }

  get formattedCompact(): string {
    if (this._value >= 1000000) {
      return `$${(this._value / 1000000).toFixed(1)}M`;
    }
    if (this._value >= 1000) {
      return `$${(this._value / 1000).toFixed(1)}K`;
    }
    return this.formatted;
  }

  isZero(): boolean {
    return this._value === 0;
  }

  isPositive(): boolean {
    return this._value > 0;
  }

  add(other: IssuePrice): IssuePrice {
    return new IssuePrice(this._value + other._value);
  }

  subtract(other: IssuePrice): IssuePrice {
    return new IssuePrice(Math.max(0, this._value - other._value));
  }

  multiply(factor: number): IssuePrice {
    return new IssuePrice(this._value * factor);
  }

  equals(other: IssuePrice): boolean {
    return this._value === other._value;
  }

  compareTo(other: IssuePrice): number {
    return this._value - other._value;
  }

  toString(): string {
    return this.formatted;
  }
}