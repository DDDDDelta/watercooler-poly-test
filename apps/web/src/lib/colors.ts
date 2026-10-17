/** Outcome line/swatch colours for multi-outcome markets. */
export const OUTCOME_COLORS = [
  '#1c55fb',
  '#14c9c9',
  '#ff7d00',
  '#f5319d',
  '#7bc616',
  '#f7ba1e',
  '#6aa1ff',
  '#f77234',
  '#0fa36b',
  '#86909c',
];

export const YES_COLOR = '#00b42a';
export const NO_COLOR = '#f53f3f';

export function outcomeColor(index: number, isBinary: boolean): string {
  if (isBinary) return index === 0 ? YES_COLOR : NO_COLOR;
  return OUTCOME_COLORS[index % OUTCOME_COLORS.length]!;
}
