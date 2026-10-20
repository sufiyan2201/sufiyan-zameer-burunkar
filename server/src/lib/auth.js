import { scrypt as scryptCb, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import jwt from "jsonwebtoken";
import { config } from "../env.js";
import { db } from "../db.js";
import { HttpError } from "./errors.js";

const scrypt = promisify(scryptCb);

/* ---------- passwords (scrypt is built into Node - no native add-ons needed) ---------- */

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const [saltHex, keyHex] = String(stored).split(":");
  if (!saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

/* ---------- login tokens ---------- */

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: "7d" });
}

export function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || "",
    role: row.role,
    organization: row.organization || null
  };
}

/* ---------- middleware ---------- */

export function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Bearer" || !token) {
    return next(new HttpError(401, "Please log in to continue."));
  }

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return next(new HttpError(401, "Your session has expired. Please log in again."));
  }

  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub);
  if (!row) return next(new HttpError(401, "Account not found. Please log in again."));

  req.user = publicUser(row);
  next();
}

export const requireRole = (role) => (req, res, next) =>
  req.user?.role === role
    ? next()
    : next(new HttpError(403, `Only ${role} accounts can do this.`));
