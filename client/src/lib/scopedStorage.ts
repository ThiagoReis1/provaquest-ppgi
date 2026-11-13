export type JsonStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function scopedStorageKey(prefix: string, id: string): string {
  return `${prefix}${encodeURIComponent(id)}`;
}

export function readScopedValue(
  storage: JsonStorage,
  prefix: string,
  id: string
): { present: boolean; value: unknown } {
  try {
    const raw = storage.getItem(scopedStorageKey(prefix, id));
    return raw === null
      ? { present: false, value: undefined }
      : { present: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { present: false, value: undefined };
  }
}

/** Persist only changed entries; unrelated entries in other tabs stay untouched. */
export function persistScopedDiff(
  storage: JsonStorage,
  prefix: string,
  previous: Record<string, unknown>,
  next: Record<string, unknown>
): boolean {
  let succeeded = true;
  const ids = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const id of ids) {
    const before = previous[id];
    const after = next[id];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    try {
      const key = scopedStorageKey(prefix, id);
      if (after === undefined) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify(after));
    } catch {
      succeeded = false;
    }
  }
  return succeeded;
}

export function writeJsonValue(
  storage: JsonStorage,
  key: string,
  value: unknown
): boolean {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
