/** Outcome line/swatch colours for multi-outcome markets. */
export const OUTCOME_COLORS = [
  '#22d3ee',
  '#a78bfa',
  '#f472b6',
  '#fbbf24',
  '#34d399',
  '#60a5fa',
  '#fb923c',
  '#e879f9',
  '#a3e635',
  '#f87171',
];

export const YES_COLOR = '#19e3a1';
export const NO_COLOR = '#ff4f7b';

export function outcomeColor(index: number, isBinary: boolean): string {
  if (isBinary) return index === 0 ? YES_COLOR : NO_COLOR;
  return OUTCOME_COLORS[index % OUTCOME_COLORS.length]!;
}
