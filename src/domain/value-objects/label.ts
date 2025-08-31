export class Label {
  private static readonly COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

  constructor(private readonly _name: string, private readonly _color: string = "#000000", private readonly _description?: string) {
    if (!_name || _name.trim().length === 0) {
      throw new Error("Label name cannot be empty");
    }

    if (!Label.COLOR_PATTERN.test(_color)) {
      throw new Error(`Invalid label color format: ${_color}`);
    }
  }

  static create(name: string, color?: string, description?: string): Label {
    return new Label(name.trim(), color || Label.generateColor(name), description?.trim());
  }

  static fromGitHub(githubLabel: any): Label {
    return new Label(githubLabel.name, `#${githubLabel.color}`, githubLabel.description || undefined);
  }

  private static generateColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }

    const color = Math.floor(Math.abs(hash) % 16777215).toString(16);
    return `#${color.padStart(6, "0")}`;
  }

  get name(): string {
    return this._name;
  }

  get color(): string {
    return this._color;
  }

  get description(): string | undefined {
    return this._description;
  }

  get colorWithoutHash(): string {
    return this._color.substring(1);
  }

  isPriceLabel(): boolean {
    return this._name.toLowerCase().includes("price:") || this._name.toLowerCase().includes("pricing:");
  }

  isTimeLabel(): boolean {
    return this._name.toLowerCase().includes("time:") || this._name.toLowerCase().includes("hours:") || this._name.toLowerCase().includes("days:");
  }

  isPriorityLabel(): boolean {
    return (
      this._name.toLowerCase().includes("priority:") ||
      this._name.toLowerCase().includes("p0") ||
      this._name.toLowerCase().includes("p1") ||
      this._name.toLowerCase().includes("p2")
    );
  }

  isStatusLabel(): boolean {
    const statusKeywords = ["status:", "state:", "wip", "blocked", "ready", "review"];
    return statusKeywords.some((keyword) => this._name.toLowerCase().includes(keyword));
  }

  equals(other: Label): boolean {
    return this._name === other._name && this._color === other._color;
  }

  matches(name: string): boolean {
    return this._name.toLowerCase() === name.toLowerCase();
  }

  toString(): string {
    return this._name;
  }

  toJSON(): Record<string, string> {
    return {
      name: this._name,
      color: this._color,
      ...(this._description && { description: this._description }),
    };
  }
}
