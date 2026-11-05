import { test } from "node:test";
import assert from "node:assert/strict";
import {
  StatusToastBridgeController,
  createStatusToastBridge,
  isFailureOutcomeMessage,
  StatusToastBridge,
  ToastSeverity,
} from "../src/ui/toast/StatusToastBridge";

interface MockToast {
  id: string;
  message: string;
  severity: ToastSeverity;
  duration?: number;
}

class MockToastManager {
  private counter = 0;
  public activeToasts: Map<string, MockToast> = new Map();
  public history: Array<{ action: "toast" | "dismiss"; toast?: MockToast; id?: string }> = [];

  public toast = (message: string, severity: ToastSeverity, duration?: number): string => {
    this.counter += 1;
    const id = `toast-${this.counter}`;
    const entry: MockToast = { id, message, severity, duration };
    this.activeToasts.set(id, entry);
    this.history.push({ action: "toast", toast: entry });
    return id;
  };

  public dismiss = (id: string): void => {
    this.activeToasts.delete(id);
    this.history.push({ action: "dismiss", id });
  };

  public hasToastWithMessage(message: string): boolean {
    for (const t of this.activeToasts.values()) {
      if (t.message === message) return true;
    }
    return false;
  }

  public getToastWithMessage(message: string): MockToast | undefined {
    for (const t of this.activeToasts.values()) {
      if (t.message === message) return t;
    }
    return undefined;
  }
}

test("isFailureOutcomeMessage correctly classifies on-chain reverts and errors", () => {
  assert.equal(isFailureOutcomeMessage("Transaction reverted"), true);
  assert.equal(isFailureOutcomeMessage("execution reverted: ERC20: transfer amount exceeds balance"), true);
  assert.equal(isFailureOutcomeMessage("Reverting due to deadline passed"), true);
  assert.equal(isFailureOutcomeMessage("Transaction failed on-chain"), true);
  assert.equal(isFailureOutcomeMessage("Contract execution failure"), true);
  assert.equal(isFailureOutcomeMessage("Error: User denied transaction"), true);

  assert.equal(isFailureOutcomeMessage("Staked and claimed rewards successfully"), false);
  assert.equal(isFailureOutcomeMessage("Transaction confirmed in block 12345"), false);
  assert.equal(isFailureOutcomeMessage("Transaction pending"), false);
  assert.equal(isFailureOutcomeMessage("Approval granted"), false);
});

test("StatusToastBridge severity: renders reverted receipt from success channel as persistent red error", () => {
  const manager = new MockToastManager();
  const bridge = createStatusToastBridge({ toast: manager.toast, dismiss: manager.dismiss });

  bridge.update({ successMessage: "Transaction reverted" });

  const active = manager.getToastWithMessage("Transaction reverted");
  assert.ok(active, "Toast should exist in active toasts");
  assert.equal(active.severity, "error", "Reverted receipt on success channel must be error severity");
  assert.equal(active.duration, 0, "Reverted receipt must have persistent duration (0)");
  assert.equal(bridge.getActiveFailureToastId(), active.id);
});

test("StatusToastBridge severity: normal success renders as green success toast", () => {
  const manager = new MockToastManager();
  const bridge = createStatusToastBridge({ toast: manager.toast, dismiss: manager.dismiss });

  bridge.update({ successMessage: "Staked and claimed rewards successfully" });

  const active = manager.getToastWithMessage("Staked and claimed rewards successfully");
  assert.ok(active, "Success toast should exist");
  assert.equal(active.severity, "success");
  assert.equal(bridge.getActiveFailureToastId(), null);
});

test("StatusToastBridge recovery: dismisses a reverted receipt on clear before the next pending action", () => {
  const manager = new MockToastManager();
  const bridge = createStatusToastBridge({ toast: manager.toast, dismiss: manager.dismiss });

  bridge.update({ successMessage: "Transaction reverted" });
  assert.ok(manager.hasToastWithMessage("Transaction reverted"));
  const revertToastId = bridge.getActiveFailureToastId();
  assert.ok(revertToastId);

  bridge.clear();

  assert.equal(manager.hasToastWithMessage("Transaction reverted"), false);
  assert.equal(bridge.getActiveFailureToastId(), null);

  const dismissEntry = manager.history.find((h) => h.action === "dismiss" && h.id === revertToastId);
  assert.ok(dismissEntry);

  bridge.update({ successMessage: "Transaction pending" });
  assert.ok(manager.hasToastWithMessage("Transaction pending"));
  assert.equal(manager.hasToastWithMessage("Transaction reverted"), false);
});

test("StatusToastBridge recovery: dismisses a reverted receipt when success is explicitly reset to null", () => {
  const manager = new MockToastManager();
  const bridge = createStatusToastBridge({ toast: manager.toast, dismiss: manager.dismiss });

  bridge.update({ successMessage: "Transaction reverted" });
  assert.ok(manager.hasToastWithMessage("Transaction reverted"));

  bridge.update({ successMessage: null });

  assert.equal(manager.hasToastWithMessage("Transaction reverted"), false);
  assert.equal(bridge.getActiveFailureToastId(), null);
});

test("StatusToastBridge recovery: dismisses persistent error toast once a success arrives", () => {
  const manager = new MockToastManager();
  const bridge = createStatusToastBridge({ toast: manager.toast, dismiss: manager.dismiss });

  bridge.update({ errorMessage: "Transaction failed" });
  assert.ok(manager.hasToastWithMessage("Transaction failed"));

  bridge.update({ errorMessage: null, successMessage: "Claimed rewards successfully" });

  assert.equal(manager.hasToastWithMessage("Transaction failed"), false);
  assert.ok(manager.hasToastWithMessage("Claimed rewards successfully"));
  assert.equal(bridge.getActiveFailureToastId(), null);
});

test("StatusToastBridge recovery: dismisses persistent error toast when status channel clears", () => {
  const manager = new MockToastManager();
  const bridge = createStatusToastBridge({ toast: manager.toast, dismiss: manager.dismiss });

  bridge.update({ errorMessage: "User rejected the request" });
  assert.ok(manager.hasToastWithMessage("User rejected the request"));

  bridge.clear();

  assert.equal(manager.hasToastWithMessage("User rejected the request"), false);
  assert.equal(bridge.getActiveFailureToastId(), null);
});

test("StatusToastBridge recovery: supersedes an older failure toast with the newest one", () => {
  const manager = new MockToastManager();
  const bridge = createStatusToastBridge({ toast: manager.toast, dismiss: manager.dismiss });

  bridge.update({ successMessage: "Transaction reverted" });
  assert.ok(manager.hasToastWithMessage("Transaction reverted"));

  bridge.update({ successMessage: null, errorMessage: "User rejected the request" });

  assert.equal(manager.hasToastWithMessage("Transaction reverted"), false);
  assert.ok(manager.hasToastWithMessage("User rejected the request"));
  assert.equal(manager.activeToasts.size, 1);
});

test("StatusToastBridge deduplication: identical messages are not re-emitted on re-render", () => {
  const manager = new MockToastManager();
  const bridge = createStatusToastBridge({ toast: manager.toast, dismiss: manager.dismiss });

  bridge.update({ successMessage: "Confirmed" });
  assert.equal(manager.history.length, 1);

  bridge.update({ successMessage: "Confirmed" });
  assert.equal(manager.history.length, 1);

  bridge.update({ successMessage: "Confirmed 2" });
  assert.equal(manager.history.length, 2);
});

test("StatusToastBridge lifecycle: destroy disposes tracked failure toasts", () => {
  const manager = new MockToastManager();
  const bridge = createStatusToastBridge({ toast: manager.toast, dismiss: manager.dismiss });

  bridge.update({ successMessage: "Transaction reverted" });
  assert.equal(manager.activeToasts.size, 1);

  bridge.destroy();
  assert.equal(manager.activeToasts.size, 0);
  assert.equal(bridge.getActiveFailureToastId(), null);
});

test("StatusToastBridge universal function helper handles inline execution", () => {
  const manager = new MockToastManager();
  const bridge = StatusToastBridge(
    { toast: manager.toast, dismiss: manager.dismiss },
    { successMessage: "Transaction reverted" }
  );

  assert.ok(bridge);
  assert.ok(manager.hasToastWithMessage("Transaction reverted"));
});
