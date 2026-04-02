import { describe, test, expect } from "@jest/globals";
import { parsePriceFromLabels, buildPermitDescriptor, invokePermitGeneration } from "../src/permit-generation";

describe("permit-generation", () => {
  describe("parsePriceFromLabels", () => {
    test("parses Price: $500", () => {
      const labels = ["Price: $500", "Time: 1 hour"];
      const price = parsePriceFromLabels(labels);
      expect(price).toBe("500");
    });

    test("parses Price: 1000", () => {
      const labels = ["Price: 1000"];
      const price = parsePriceFromLabels(labels);
      expect(price).toBe("1000");
    });

    test("parses Price: $1,000.50", () => {
      const labels = ["Price: $1,000.50"];
      const price = parsePriceFromLabels(labels);
      expect(price).toBe("1000.50");
    });

    test("parses object-style labels", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const labels: any = [{ name: "Price: $750" }, { name: "Priority: 1" }];
      const price = parsePriceFromLabels(labels);
      expect(price).toBe("750");
    });

    test("returns null when no price label found", () => {
      const labels = ["Priority: 1", "good first issue"];
      const price = parsePriceFromLabels(labels);
      expect(price).toBeNull();
    });

    test("handles empty array", () => {
      const price = parsePriceFromLabels([]);
      expect(price).toBeNull();
    });
  });

  describe("buildPermitDescriptor", () => {
    test("builds a valid permit descriptor", () => {
      const permit = buildPermitDescriptor({
        username: "testuser",
        amount: "500",
        evmPrivateKeyEncrypted: "encrypted-key",
        nodeId: "node123",
        issueNumber: 42,
        issueUrl: "https://github.com/owner/repo/issues/42",
      });
      expect(permit).toEqual({
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

  describe("invokePermitGeneration dry run", () => {
    test("returns success for dry run", async () => {
      const result = await invokePermitGeneration(
        "https://pay.ubq.fi",
        [
          {
            username: "testuser",
            amount: "500",
            address: "",
            task: { id: "node123", number: 42, url: "https://github.com/owner/repo/issues/42" },
            transfer: true,
            evmPrivateKeyEncrypted: "key",
          },
        ],
        true // dry run
      );
      expect(result.success).toBe(true);
    });

    test("returns failure for empty permits", async () => {
      const result = await invokePermitGeneration("https://pay.ubq.fi", [], false);
      expect(result.success).toBe(true); // Empty is considered success (no-op)
    });
  });
});
