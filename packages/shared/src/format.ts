/** Round to cents. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function toCents(n: number): number {
  return Math.round(n * 100);
}

export function fromCents(c: number): number {
  return c / 100;
}
