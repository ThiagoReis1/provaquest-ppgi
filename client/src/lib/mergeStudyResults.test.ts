import { describe, expect, it } from "vitest";
import { mergeStudyResults, withStudyResult } from "./mergeStudyResults";

describe("study result merging across tabs", () => {
  it("uses persisted values when a tab has a stale copy", () => {
    expect(
      mergeStudyResults(
        { "2026-02-1": false, "2026-02-2": true },
        { "2026-02-1": true }
      )
    ).toEqual({ "2026-02-1": true, "2026-02-2": true });
  });

  it("preserves other tabs' results when recording another question", () => {
    expect(
      withStudyResult({}, { "2026-02-1": true }, "2026-02-2", false)
    ).toEqual({ "2026-02-1": true, "2026-02-2": false });
  });

  it("lets the current answer replace a stale result for the same question", () => {
    expect(
      withStudyResult(
        { "2026-02-1": false },
        { "2026-02-1": true },
        "2026-02-1",
        false
      )
    ).toEqual({ "2026-02-1": false });
  });
});
