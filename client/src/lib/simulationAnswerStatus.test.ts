import { describe, expect, it } from "vitest";
import { simulationAnswerStatus } from "./simulationAnswerStatus";

describe("simulationAnswerStatus", () => {
  it("keeps even a correct-looking draft pending until it is submitted", () => {
    expect(simulationAnswerStatus("B", "B", false)).toBe("pending");
  });

  it("does not score an item without a valid answer key", () => {
    expect(simulationAnswerStatus("B", null, true)).toBe("pending");
  });

  it("counts only confirmed correct answers", () => {
    expect(simulationAnswerStatus("B", "B", true)).toBe("correct");
    expect(simulationAnswerStatus("A", "B", true)).toBe("incorrect");
    expect(simulationAnswerStatus(undefined, "B", true)).toBe("pending");
  });
});
