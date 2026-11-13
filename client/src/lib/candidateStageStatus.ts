export function didCandidatePassStage(
  stageId: string,
  nextStageId: string | undefined,
  candidateStages: Record<string, unknown>,
  passedStages: readonly string[]
): boolean {
  return (
    passedStages.includes(stageId) ||
    (nextStageId !== undefined && Boolean(candidateStages[nextStageId]))
  );
}
