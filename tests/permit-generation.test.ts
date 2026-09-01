import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import {
  buildPermitDescriptor,
  getAssigneeLogin,
  hasTransferLabel,
  invokePermitGeneration,
  markTransferResult,
  parsePriceFromLabels,
} from "../src/permit-generation";

describe("permit-generation", () => {
  describe("parsePriceFromLabels", () => {
    test("parses Price: $500", () => {
      expect(parsePriceFromLabels(["Price: $500", "Time: 1 hour"])).toBe("500");
    });

    test("parses Price: 600 USD", () => {
      expect(parsePriceFromLabels(["Price: 600 USD"])).toBe("600");
    });

    test("parses Price: $1,000.50", () => {
      expect(parsePriceFromLabels(["Price: $1,000.50"])).toBe("1000.50");
    });

    test("parses object-style labels", () => {
      const labels = [{ name: "Price: $750" }, { name: "Priority: 1" }];
      expect(parsePriceFromLabels(labels)).toBe("750");
    });

    test("returns null when no price label found", () => {
      expect(parsePriceFromLabels(["Priority: 1", "good first issue"])).toBeNull();
    });
  });

  describe("getAssigneeLogin", () => {
    test("prefers assignee.login", () => {
      expect(
        getAssigneeLogin({
          assignee: { login: "alice" },
          assignees: [{ login: "bob" }],
        })
      ).toBe("alice");
    });

    test("falls back to first assignees entry", () => {
      expect(getAssigneeLogin({ assignees: [{ login: "bob" }] })).toBe("bob");
    });
  });

  describe("hasTransferLabel", () => {
    test("detects transfer labels", () => {
      expect(hasTransferLabel(["Transfer: Completed"])).toBe(true);
      expect(hasTransferLabel(["Transfer: Failed"])).toBe(true);
    });
  });

  describe("buildPermitDescriptor", () => {
    test("builds a valid permit descriptor with transfer:true", () => {
      expect(
        buildPermitDescriptor({
          username: "testuser",
          amount: "500",
          evmPrivateKeyEncrypted: "encrypted-key",
          nodeId: "node123",
          issueNumber: 42,
          issueUrl: "https://github.com/owner/repo/issues/42",
        })
      ).toEqual({
        username: "testuser",
        amount: "500",
        address: "",
        task: {
          id: "node123",
          number: 42,
          url: "https://github.com/owner/repo/issues/42",
        },
        transfer: true,
        evmPrivateKeyEncrypted: "encrypted-key",
      });
    });
  });

  describe("invokePermitGeneration HTTP", () => {
    const permit = buildPermitDescriptor({
      username: "alice",
      amount: "600",
      evmPrivateKeyEncrypted: "key",
      nodeId: "NODE_1",
      issueNumber: 7,
      issueUrl: "https://github.com/devpool-directory/devpool-directory/issues/7",
    });

    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
      jest.restoreAllMocks();
    });

    test("POSTs permits to /permit-generation and returns tx hash", async () => {
      const fetchMock = jest.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        json: async () => ({ tx_hash: "0xabc" }),
      } as Response);
      global.fetch = fetchMock;

      const result = await invokePermitGeneration("https://pay.ubq.fi", [permit], false);

      expect(result).toEqual({ success: true, tx_hash: "0xabc", error: undefined });
      expect(fetchMock).toHaveBeenCalledWith(
        "https://pay.ubq.fi/permit-generation",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ permits: [permit] }),
        })
      );
    });

    test("returns failure on non-OK HTTP response", async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => "bad gateway",
      } as Response);

      const result = await invokePermitGeneration("https://pay.ubq.fi", [permit], false);
      expect(result.success).toBe(false);
      expect(result.error).toContain("HTTP 502");
      expect(result.error).toContain("bad gateway");
    });

    test("returns failure when response body includes error", async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        json: async () => ({ error: "insufficient funds" }),
      } as Response);

      const result = await invokePermitGeneration("https://pay.ubq.fi", [permit], false);
      expect(result).toEqual({ success: false, tx_hash: undefined, error: "insufficient funds" });
    });

    test("dry run skips HTTP", async () => {
      const fetchMock = jest.fn<typeof fetch>();
      global.fetch = fetchMock;

      const result = await invokePermitGeneration("https://pay.ubq.fi", [permit], true);
      expect(result.success).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("markTransferResult", () => {
    test("writes Transfer: Completed on success", async () => {
      const addLabels = jest.fn<() => Promise<unknown>>().mockResolvedValue({});
      await markTransferResult({ issues: { addLabels } }, "devpool-directory", "devpool-directory", 42, true);

      expect(addLabels).toHaveBeenCalledWith({
        owner: "devpool-directory",
        repo: "devpool-directory",
        issue_number: 42,
        labels: ["Transfer: Completed"],
      });
    });

    test("writes Transfer: Failed on failure", async () => {
      const addLabels = jest.fn<() => Promise<unknown>>().mockResolvedValue({});
      await markTransferResult({ issues: { addLabels } }, "devpool-directory", "devpool-directory", 99, false);

      expect(addLabels).toHaveBeenCalledWith({
        owner: "devpool-directory",
        repo: "devpool-directory",
        issue_number: 99,
        labels: ["Transfer: Failed"],
      });
    });
  });
});
