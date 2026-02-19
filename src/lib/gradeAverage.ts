/**
 * Mirror of DB logic for grade averages (partial: 2 decimals; final: integer).
 * Used for unit tests and optional client-side preview.
 */

/**
 * Arithmetic mean of grades, rounded to 2 decimals (partial average).
 */
export function roundPartialAverage(grades: number[]): number {
  if (grades.length === 0) return 0;
  const sum = grades.reduce((a, b) => a + b, 0);
  return Math.round((sum / grades.length) * 100) / 100;
}

/**
 * Final average rounded to integer (1-10). Romanian rule: .5 rounds up.
 */
export function roundFinalGrade(average: number): number {
  const rounded = Math.round(average);
  const frac = average - Math.floor(average);
  if (frac === 0.5) return Math.min(10, Math.floor(average) + 1);
  return Math.max(1, Math.min(10, rounded));
}

/**
 * Weighted average: normal grades and "teza" (25% weight).
 * tezaWeight in [0,1], e.g. 0.25 for 25%.
 */
export function weightedAverage(
  normalGrades: number[],
  tezaGrade: number | null,
  tezaWeight: number = 0.25
): number {
  if (normalGrades.length === 0 && tezaGrade === null) return 0;
  if (tezaGrade === null) return roundPartialAverage(normalGrades);
  const normalAvg = normalGrades.length > 0 ? roundPartialAverage(normalGrades) : 0;
  const normalW = 1 - tezaWeight;
  const weighted = normalAvg * normalW + tezaGrade * tezaWeight;
  return Math.round(weighted * 100) / 100;
}
