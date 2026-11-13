export type StudyResultMap = Record<string, boolean>;

/**
 * Merges the latest localStorage snapshot over a tab's possibly stale state.
 * Since localStorage is shared across tabs, persisted values take precedence.
 */
export function mergeStudyResults(
  current: StudyResultMap,
  latestPersisted: StudyResultMap
): StudyResultMap {
  return { ...current, ...latestPersisted };
}

/** Preserves other tabs' latest results while recording this answer. */
export function withStudyResult(
  current: StudyResultMap,
  latestPersisted: StudyResultMap,
  id: string,
  correct: boolean
): StudyResultMap {
  return { ...mergeStudyResults(current, latestPersisted), [id]: correct };
}
