export type SimulationAnswerStatus = "pending" | "correct" | "incorrect";

export function simulationAnswerStatus(
  answer: string | undefined,
  correctAnswer: string | null,
  submitted: boolean
): SimulationAnswerStatus {
  if (!submitted || answer === undefined || correctAnswer === null)
    return "pending";
  return answer === correctAnswer ? "correct" : "incorrect";
}
