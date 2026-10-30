import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { gradeFor } from "../../server/management.js";

const rank = { F: 0, D: 1, C: 2, B: 3, A: 4 };

describe("management grade properties", () => {
  it("keeps every grade within the configured thresholds", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (percentage) => {
        const result = gradeFor(percentage);
        const expected = percentage >= 90 ? "A"
          : percentage >= 80 ? "B"
            : percentage >= 70 ? "C"
              : percentage >= 60 ? "D" : "F";
        expect(result).toBe(expected);
      }),
      { numRuns: 250 },
    );
  });

  it("never lowers a grade when the percentage increases", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (left, right) => {
          const lower = Math.min(left, right);
          const higher = Math.max(left, right);
          expect(rank[gradeFor(higher)]).toBeGreaterThanOrEqual(rank[gradeFor(lower)]);
        },
      ),
      { numRuns: 250 },
    );
  });
});
