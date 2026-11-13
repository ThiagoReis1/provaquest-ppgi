import { describe, expect, it } from "vitest";
import {
  persistScopedDiff,
  readScopedValue,
  scopedStorageKey,
} from "./scopedStorage";

function createStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("scoped local storage", () => {
  it("keeps independent editions when two stale snapshots write separately", () => {
    const storage = createStorage();
    const prefix = "sim:";
    const firstTabInitial = {};
    const secondTabInitial = {};

    expect(
      persistScopedDiff(storage, prefix, firstTabInitial, {
        "2026-02": { answers: { q1: "A" }, submitted: { q1: true } },
      })
    ).toBe(true);
    expect(
      persistScopedDiff(storage, prefix, secondTabInitial, {
        "2026-01": { answers: { q2: "B" }, submitted: {} },
      })
    ).toBe(true);

    expect(
      JSON.parse(storage.getItem(scopedStorageKey(prefix, "2026-02"))!)
    ).toEqual({
      answers: { q1: "A" },
      submitted: { q1: true },
    });
    expect(
      JSON.parse(storage.getItem(scopedStorageKey(prefix, "2026-01"))!)
    ).toEqual({
      answers: { q2: "B" },
      submitted: {},
    });
  });

  it("removes only the reset entry and exposes it as absent to other tabs", () => {
    const storage = createStorage();
    const prefix = "sim:";
    const first = { "2026-02": { ids: ["q1"] }, "2026-01": { ids: ["q2"] } };
    const next = { "2026-01": { ids: ["q2"] } };

    persistScopedDiff(storage, prefix, {}, first);
    persistScopedDiff(storage, prefix, first, next);

    expect(readScopedValue(storage, prefix, "2026-02")).toEqual({
      present: false,
      value: undefined,
    });
    expect(readScopedValue(storage, prefix, "2026-01")).toEqual({
      present: true,
      value: { ids: ["q2"] },
    });
  });
});
