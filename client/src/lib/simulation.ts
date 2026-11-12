export type SimulationState = {
  sessionIds: string[];
  sessionIndex: number;
  answers: Record<string, string>;
  submitted: Record<string, boolean>;
  finished: boolean;
};

export const emptySimulationState = (): SimulationState => ({
  sessionIds: [],
  sessionIndex: 0,
  answers: {},
  submitted: {},
  finished: false,
});

export function resetSimulationState(): SimulationState {
  return emptySimulationState();
}

export function questionId(editionId: string, number: number): string {
  return `${editionId}-${number}`;
}

export function sessionBelongsToEdition(
  sessionIds: readonly string[],
  editionId: string
): boolean {
  if (editionId === "todos") return true;
  return sessionIds.every(id => id.startsWith(`${editionId}-`));
}
