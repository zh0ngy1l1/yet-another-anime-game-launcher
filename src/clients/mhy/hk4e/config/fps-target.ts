declare const fpsTarget: unique symbol;

/** A number which has passed the HK4E whole-number range check. */
export type FpsTarget = number & { readonly [fpsTarget]: true };

export type FpsValidation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: "target" };

function isFpsTarget(value: number): value is FpsTarget {
  return Number.isInteger(value) && value >= 1 && value <= 360;
}

export function parseFpsTarget(raw: unknown): FpsValidation<FpsTarget> {
  // Exactly [0-9]+, including rejection of a final newline. Keep leading zeros
  // in the draft; only this validated domain boundary converts text to a number.
  if (typeof raw === "string") {
    if (raw === "" || /[^0-9]/.test(raw)) return { ok: false, error: "target" };
    raw = Number(raw);
  }
  if (typeof raw !== "number" || !isFpsTarget(raw)) {
    return { ok: false, error: "target" };
  }
  return { ok: true, value: raw };
}
