import { describe, expect, test } from "bun:test";

import { buildColumnMovePatch, buildRequestChangesPatch, getAdjacentTaskColumns } from "./task-actions";

describe("task action patches", () => {
  test("builds a canonical request-changes patch", () => {
    expect(buildRequestChangesPatch("  Add the missing review summary.  ")).toEqual({
      status: "todo",
      column: "todo",
      approval_needed: false,
      approval_requested_by: null,
      approval_reason: "Add the missing review summary.",
      approved_by: null,
      approved_at: null,
      approval_outcome: "pending",
      blocked_reason: null,
      blocked_since: null,
    });
  });

  test("builds a canonical column move patch for the review column", () => {
    expect(buildColumnMovePatch("review")).toEqual({
      column: "review",
      status: "waiting-approval",
      approval_needed: true,
      approval_requested_by: null,
      approval_reason: null,
      approved_by: null,
      approved_at: null,
      approval_outcome: "pending",
      blocked_reason: null,
      blocked_since: null,
    });
  });

  test("returns previous and next task columns", () => {
    expect(getAdjacentTaskColumns("in-progress")).toEqual({
      previous: { value: "todo", label: "Todo" },
      next: { value: "review", label: "Review" },
    });

    expect(getAdjacentTaskColumns("todo")).toEqual({
      previous: null,
      next: { value: "in-progress", label: "In progress" },
    });

    expect(getAdjacentTaskColumns("done")).toEqual({
      previous: { value: "review", label: "Review" },
      next: null,
    });
  });
});
