/** Outcome line/swatch colours for multi-outcome markets. */
export const OUTCOME_COLORS = [
  '#ff7a1a',
  '#2dd4bf',
  '#facc15',
  '#f472b6',
  '#38bdf8',
  '#a3e635',
  '#fb7185',
  '#94a3b8',
  '#fdba74',
  '#c4b5fd',
];

export const YES_COLOR = '#19e3a1';
export const NO_COLOR = '#ff4f7b';

export function outcomeColor(index: number, isBinary: boolean): string {
  if (isBinary) return index === 0 ? YES_COLOR : NO_COLOR;
  return OUTCOME_COLORS[index % OUTCOME_COLORS.length]!;
}
