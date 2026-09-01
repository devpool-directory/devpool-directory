import { describe, expect, jest, test } from "@jest/globals";
import {
  maybeTriggerAutomaticTransfer,
  processCompletedIssueTransfer,
} from "../src/transfer/automatic-transfer";
import type { PermitDescriptor, TransferResult } from "../src/permit-generation";

const directoryIssue = {
  node_id: "DIR_NODE",
  number: 5017,
  html_url: "https://github.com/devpool-directory/devpool-directory/issues/5017",
  labels: [{ name: "Price: 600 USD" }],
};

const partner = {
  assignees: [{ login: "hunter" }],
  labels: [{ name: "Price: 600 USD" }],
};

const octokitWrite = {
  issues: {
    addLabels: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
  },
};

function makeDeps(overrides?: {
  invokeResult?: TransferResult;
  invokeImpl?: (permitUrl: string, permits: PermitDescriptor[], dry: boolean) => Promise<TransferResult>;
}) {
  const invokePermitGeneration =
    overrides?.invokeImpl ??
    jest.fn<() => Promise<TransferResult>>().mockResolvedValue(
      overrides?.invokeResult ?? { success: true, tx_hash: "0xdeadbeef" }
    );

  const markTransferResult = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

  return { invokePermitGeneration, markTransferResult };
}

describe("automatic-transfer orchestration", () => {
  describe("maybeTriggerAutomaticTransfer (cleanup hook)", () => {
    test("invokes permit service and writes Transfer: Completed for completed priced issues", async () => {
      const deps = makeDeps();

      const outcome = await maybeTriggerAutomaticTransfer(
        {
          enabled: true,
          dry: false,
          desiredState: "closed",
          desiredReason: "completed",
          partner,
          partnerLabels: ["Price: 600 USD"],
          directoryIssue,
          permitUrl: "https://pay.ubq.fi",
          evmPrivateKey: "encrypted",
          owner: "devpool-directory",
          repo: "devpool-directory",
          octokitWrite,
        },
        deps
      );

      expect(outcome).toBe("success");
      expect(deps.invokePermitGeneration).toHaveBeenCalledWith(
        "https://pay.ubq.fi",
        [
          expect.objectContaining({
            username: "hunter",
            amount: "600",
            transfer: true,
            evmPrivateKeyEncrypted: "encrypted",
          }),
        ],
        false
      );
      expect(deps.markTransferResult).toHaveBeenCalledWith(
        octokitWrite,
        "devpool-directory",
        "devpool-directory",
        5017,
        true
      );
    });

    test("writes Transfer: Failed when permit service returns error", async () => {
      const deps = makeDeps({ invokeResult: { success: false, error: "reverted" } });

      const outcome = await maybeTriggerAutomaticTransfer(
        {
          enabled: true,
          dry: false,
          desiredState: "closed",
          desiredReason: "completed",
          partner,
          partnerLabels: ["Price: 600 USD"],
          directoryIssue,
          permitUrl: "https://pay.ubq.fi",
          evmPrivateKey: "encrypted",
          owner: "devpool-directory",
          repo: "devpool-directory",
          octokitWrite,
        },
        deps
      );

      expect(outcome).toBe("failed");
      expect(deps.markTransferResult).toHaveBeenCalledWith(
        octokitWrite,
        "devpool-directory",
        "devpool-directory",
        5017,
        false
      );
    });

    test("skips when transfer disabled", async () => {
      const deps = makeDeps();

      const outcome = await maybeTriggerAutomaticTransfer(
        {
          enabled: false,
          dry: false,
          desiredState: "closed",
          desiredReason: "completed",
          partner,
          partnerLabels: ["Price: 600 USD"],
          directoryIssue,
          permitUrl: "https://pay.ubq.fi",
          evmPrivateKey: "encrypted",
          owner: "devpool-directory",
          repo: "devpool-directory",
          octokitWrite,
        },
        deps
      );

      expect(outcome).toBe("skipped");
      expect(deps.invokePermitGeneration).not.toHaveBeenCalled();
    });

    test("skips when issue already has Transfer label", async () => {
      const deps = makeDeps();

      const outcome = await maybeTriggerAutomaticTransfer(
        {
          enabled: true,
          dry: false,
          desiredState: "closed",
          desiredReason: "completed",
          partner,
          partnerLabels: ["Price: 600 USD"],
          directoryIssue: {
            ...directoryIssue,
            labels: [{ name: "Transfer: Completed" }],
          },
          permitUrl: "https://pay.ubq.fi",
          evmPrivateKey: "encrypted",
          owner: "devpool-directory",
          repo: "devpool-directory",
          octokitWrite,
        },
        deps
      );

      expect(outcome).toBe("skipped");
      expect(deps.invokePermitGeneration).not.toHaveBeenCalled();
    });

    test("skips open partner issues", async () => {
      const deps = makeDeps();

      const outcome = await maybeTriggerAutomaticTransfer(
        {
          enabled: true,
          dry: false,
          desiredState: "open",
          desiredReason: undefined,
          partner,
          partnerLabels: ["Price: 600 USD"],
          directoryIssue,
          permitUrl: "https://pay.ubq.fi",
          evmPrivateKey: "encrypted",
          owner: "devpool-directory",
          repo: "devpool-directory",
          octokitWrite,
        },
        deps
      );

      expect(outcome).toBe("skipped");
      expect(deps.invokePermitGeneration).not.toHaveBeenCalled();
    });
  });

  describe("processCompletedIssueTransfer (transfer CLI)", () => {
    test("invokes permit service for closed completed partner issues", async () => {
      const deps = makeDeps();

      const outcome = await processCompletedIssueTransfer(
        {
          directoryIssue,
          partner: { ...partner, state: "closed", state_reason: "completed" },
          permitUrl: "https://pay.ubq.fi",
          evmPrivateKey: "encrypted",
          owner: "devpool-directory",
          repo: "devpool-directory",
          dry: false,
          force: false,
          octokitWrite,
        },
        deps
      );

      expect(outcome).toBe("success");
      expect(deps.invokePermitGeneration).toHaveBeenCalled();
      expect(deps.markTransferResult).toHaveBeenCalledWith(
        octokitWrite,
        "devpool-directory",
        "devpool-directory",
        5017,
        true
      );
    });

    test("dry run invokes permit service in dry mode and skips label write", async () => {
      const deps = makeDeps();

      const outcome = await processCompletedIssueTransfer(
        {
          directoryIssue,
          partner: { ...partner, state: "closed", state_reason: "completed" },
          permitUrl: "https://pay.ubq.fi",
          evmPrivateKey: "encrypted",
          owner: "devpool-directory",
          repo: "devpool-directory",
          dry: true,
          force: false,
          octokitWrite: null,
        },
        deps
      );

      expect(outcome).toBe("success");
      expect(deps.invokePermitGeneration).toHaveBeenCalledWith(
        "https://pay.ubq.fi",
        expect.any(Array),
        true
      );
      expect(deps.markTransferResult).not.toHaveBeenCalled();
    });

    test("skips not_planned closures", async () => {
      const deps = makeDeps();

      const outcome = await processCompletedIssueTransfer(
        {
          directoryIssue,
          partner: { ...partner, state: "closed", state_reason: "not_planned" },
          permitUrl: "https://pay.ubq.fi",
          evmPrivateKey: "encrypted",
          owner: "devpool-directory",
          repo: "devpool-directory",
          dry: false,
          force: false,
          octokitWrite,
        },
        deps
      );

      expect(outcome).toBe("skipped");
      expect(deps.invokePermitGeneration).not.toHaveBeenCalled();
    });
  });
});
