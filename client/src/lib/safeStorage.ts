export type WritableJsonStorage = Pick<Storage, "setItem" | "removeItem">;

export function writeJsonSafely(
  storage: Pick<Storage, "setItem">,
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

export function persistBeforeRemovingLegacy(
  storage: WritableJsonStorage,
  currentKey: string,
  legacyKey: string,
  value: unknown
): boolean {
  if (!writeJsonSafely(storage, currentKey, value)) return false;
  try {
    storage.removeItem(legacyKey);
    return true;
  } catch {
    return false;
  }
}
