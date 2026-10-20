export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Lets async route handlers throw errors that reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/* ---- tiny validation helpers (each throws a 400 with a readable message) ---- */

export function text(value, label, { min = 1, max = 200, required = true } = {}) {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) {
    if (!required) return "";
    throw new HttpError(400, `${label} is required.`);
  }
  if (s.length < min) throw new HttpError(400, `${label} must be at least ${min} characters.`);
  if (s.length > max) throw new HttpError(400, `${label} must be at most ${max} characters.`);
  return s;
}

export function integer(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new HttpError(400, `${label} must be a whole number.`);
  if (n < min) throw new HttpError(400, `${label} must be at least ${min}.`);
  if (n > max) throw new HttpError(400, `${label} must be at most ${max}.`);
  return n;
}

export function oneOf(value, label, allowed) {
  if (!allowed.includes(value)) {
    throw new HttpError(400, `${label} must be one of: ${allowed.join(", ")}.`);
  }
  return value;
}

export function email(value) {
  const s = text(value, "Email", { max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new HttpError(400, "Enter a valid email address.");
  return s;
}
