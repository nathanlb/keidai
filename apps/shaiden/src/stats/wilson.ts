const Z_95 = 1.959963984540054;

export interface WilsonInterval {
  low: number;
  high: number;
}

/** Wilson score interval for a binomial proportion. `successes` must be within `eligible`. */
export function wilsonInterval(
  successes: number,
  eligible: number,
  z = Z_95,
): WilsonInterval {
  if (eligible <= 0) {
    return { low: 0, high: 0 };
  }
  const clamped = Math.min(Math.max(successes, 0), eligible);
  const p = clamped / eligible;
  const z2 = z * z;
  const denominator = 1 + z2 / eligible;
  const center = (p + z2 / (2 * eligible)) / denominator;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / eligible + z2 / (4 * eligible * eligible))) /
    denominator;
  return {
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
  };
}
