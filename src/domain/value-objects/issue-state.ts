export type IssueStateValue = "open" | "closed" | "all";

export class IssueState {
  private static readonly VALID_STATES: IssueStateValue[] = ["open", "closed", "all"];

  constructor(private readonly _value: IssueStateValue) {
    if (!IssueState.VALID_STATES.includes(_value)) {
      throw new Error(`Invalid issue state: ${_value}`);
    }
  }

  static open(): IssueState {
    return new IssueState("open");
  }

  static closed(): IssueState {
    return new IssueState("closed");
  }

  static all(): IssueState {
    return new IssueState("all");
  }

  static fromString(state: string): IssueState {
    const normalized = state.toLowerCase() as IssueStateValue;

    if (!IssueState.VALID_STATES.includes(normalized)) {
      throw new Error(`Invalid issue state: ${state}`);
    }

    return new IssueState(normalized);
  }

  get value(): IssueStateValue {
    return this._value;
  }

  isOpen(): boolean {
    return this._value === "open";
  }

  isClosed(): boolean {
    return this._value === "closed";
  }

  isAll(): boolean {
    return this._value === "all";
  }

  equals(other: IssueState): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }

  toUpperCase(): string {
    return this._value.toUpperCase();
  }
}
