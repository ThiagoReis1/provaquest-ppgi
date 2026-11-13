import { describe, expect, it, vi } from "vitest";
import { persistBeforeRemovingLegacy } from "./safeStorage";

function makeStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
  };
}

describe("persistBeforeRemovingLegacy", () => {
  it("writes the new value before removing the legacy key", () => {
    const storage = makeStorage({ legacy: "old" });

    const persisted = persistBeforeRemovingLegacy(
      storage,
      "current",
      "legacy",
      { answered: true }
    );

    expect(persisted).toBe(true);
    expect(storage.values.get("current")).toBe('{"answered":true}');
    expect(storage.values.has("legacy")).toBe(false);
    expect(storage.removeItem).toHaveBeenCalledWith("legacy");
  });

  it("preserves the legacy key if the new write fails", () => {
    const storage = makeStorage({ legacy: "old" });
    storage.setItem.mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });

    const persisted = persistBeforeRemovingLegacy(
      storage,
      "current",
      "legacy",
      { answered: true }
    );

    expect(persisted).toBe(false);
    expect(storage.values.has("legacy")).toBe(true);
    expect(storage.removeItem).not.toHaveBeenCalled();
  });
});
