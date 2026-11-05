/**
 * Status Toast Bridge
 *
 * Mirrors status messages (from blockchain interactions / staking actions) into UI toasts.
 * Provides resilient lifecycle management for toasts, ensuring that:
 * 1. On-chain failure outcomes arriving on success channels (e.g. "Transaction reverted")
 *    are appropriately tagged and rendered as persistent error toasts.
 * 2. When the status channel is cleared (e.g. before initiating a new action or on wallet change),
 *    any pending/stale reverted-receipt toast is immediately dismissed.
 * 3. Subsequent pending actions (or new transactions) do not see stale error notifications.
 *
 * References:
 * - Issue: devpool-directory#6139 (Dismiss reverted-receipt toasts when the status clears)
 * - Upstream: ubiquity/stake.ubq.fi#44
 */

export type ToastSeverity = "success" | "error" | "info" | "warning";

export type ToastEmitter = (message: string, severity: ToastSeverity, duration?: number) => string;
export type ToastDismisser = (id: string) => void;

export interface ToastBridgeOptions {
  toast: ToastEmitter;
  dismiss: ToastDismisser;
}

export interface StatusState {
  successMessage?: string | null;
  errorMessage?: string | null;
}

/**
 * Status-channel messages that describe a failed on-chain outcome. The status context
 * only carries text, so severity has to come from the message the staking hook set; a
 * reverted receipt arrives on the success channel and must not render as a green toast.
 */
const FAILURE_OUTCOME_PATTERN = /\b(revert(ed|ing)?|failed|failure|error)\b/i;

/**
 * Checks if a message represents an on-chain failure outcome (such as a reverted receipt)
 * even when delivered over the success channel.
 */
export function isFailureOutcomeMessage(message: string): boolean {
  return FAILURE_OUTCOME_PATTERN.test(message);
}

/**
 * Core Controller managing status messages to toast notifications lifecycle.
 * Maintains reference identity to prevent unnecessary re-emissions while ensuring
 * that any cleared channel accurately dismisses persistent reverted-receipt toasts.
 */
export class StatusToastBridgeController {
  private toast: ToastEmitter;
  private dismiss: ToastDismisser;

  private emitted: {
    success: string | null;
    error: string | null;
  } = {
    success: null,
    error: null,
  };

  private failureToastId: string | null = null;

  constructor(options: ToastBridgeOptions) {
    this.toast = options.toast;
    this.dismiss = options.dismiss;
  }

  /**
   * Updates the toast emitter and dismisser function references.
   */
  public setOptions(options: ToastBridgeOptions): void {
    this.toast = options.toast;
    this.dismiss = options.dismiss;
  }

  /**
   * Returns the ID of the currently tracked failure toast, if any.
   */
  public getActiveFailureToastId(): string | null {
    return this.failureToastId;
  }

  /**
   * Returns currently emitted status snapshot.
   */
  public getEmittedState(): { success: string | null; error: string | null } {
    return { ...this.emitted };
  }

  /**
   * Handles incoming status updates from success and error channels.
   * Mirrors the exact logic of the React StatusToastBridge effect hooks:
   * 1. Error effect executes: supersedes any existing failure toast, tracks new error.
   * 2. Success effect executes:
   *    - If successMessage is null/empty: dismisses failureToastId if not cleared by error.
   *    - If successMessage has failure keywords: emits persistent error toast (duration: 0).
   *    - Otherwise emits regular success toast.
   */
  public update(status: StatusState): void {
    const successMessage = status.successMessage ?? null;
    const errorMessage = status.errorMessage ?? null;

    // Phase 1: Error channel evaluation (matches errorMessage effect)
    if (this.emitted.error !== errorMessage) {
      if (this.failureToastId) {
        this.dismiss(this.failureToastId);
        this.failureToastId = null;
      }

      if (!errorMessage) {
        this.emitted.error = null;
      } else {
        this.emitted.error = errorMessage;
        this.failureToastId = this.toast(errorMessage, "error", 0);
      }
    }

    // Phase 2: Success channel evaluation (matches successMessage effect)
    if (this.emitted.success !== successMessage) {
      if (!successMessage) {
        // A cleared success channel must also retire a reverted-receipt toast.
        // The error handler runs first, so preserve any failure it just emitted.
        if (!errorMessage && this.failureToastId) {
          this.dismiss(this.failureToastId);
          this.failureToastId = null;
        }
        this.emitted.success = null;
        return;
      }

      this.emitted.success = successMessage;

      // Recovery / new success must not leave previous persistent failure on screen
      if (this.failureToastId) {
        this.dismiss(this.failureToastId);
        this.failureToastId = null;
      }

      if (isFailureOutcomeMessage(successMessage)) {
        // On-chain reverts are reported on the success channel but are still failures
        this.failureToastId = this.toast(successMessage, "error", 0);
        return;
      }

      this.toast(successMessage, "success");
    }
  }

  /**
   * Clears both success and error channels, retiring any active failure toasts.
   */
  public clear(): void {
    this.update({ successMessage: null, errorMessage: null });
  }

  /**
   * Disposes the controller and cleans up any active failure toast.
   */
  public destroy(): void {
    if (this.failureToastId) {
      this.dismiss(this.failureToastId);
      this.failureToastId = null;
    }
    this.emitted = { success: null, error: null };
  }
}

/**
 * Factory helper for initializing a StatusToastBridgeController instance.
 */
export function createStatusToastBridge(options: ToastBridgeOptions): StatusToastBridgeController {
  return new StatusToastBridgeController(options);
}

/**
 * Universal StatusToastBridge function:
 * Can be executed as a standalone controller runner or integrated into a UI component.
 */
export function StatusToastBridge(options?: ToastBridgeOptions, status?: StatusState): StatusToastBridgeController | null {
  if (options && status) {
    const bridge = new StatusToastBridgeController(options);
    bridge.update(status);
    return bridge;
  }
  return null;
}
