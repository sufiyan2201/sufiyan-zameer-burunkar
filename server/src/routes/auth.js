import { Router } from "express";
import { db } from "../db.js";
import { HttpError, asyncHandler, text, email, oneOf } from "../lib/errors.js";
import { hashPassword, verifyPassword, signToken, publicUser, requireAuth } from "../lib/auth.js";

const router = Router();

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const body = req.body || {};

    const name = text(body.name, "Name", { min: 2, max: 80 });
    const address = email(body.email);
    const phone = text(body.phone, "Phone number", { required: false, max: 20 });
    const role = oneOf(body.role ?? "Donor", "Account type", ["Donor", "NGO"]);
    const organization =
      role === "NGO" ? text(body.organization, "Organisation", { min: 2, max: 120 }) : null;

    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < 8) throw new HttpError(400, "Password must be at least 8 characters.");
    if (password.length > 100) throw new HttpError(400, "Password must be at most 100 characters.");

    if (db.prepare("SELECT id FROM users WHERE email = ?").get(address)) {
      throw new HttpError(409, "An account with this email already exists. Try logging in.");
    }

    let id;
    try {
      const result = db
        .prepare(
          `INSERT INTO users (name, email, phone, password_hash, role, organization, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(name, address, phone, await hashPassword(password), role, organization, Date.now());
      id = Number(result.lastInsertRowid);
    } catch (err) {
      // Two sign-ups with the same email at the same instant.
      if (String(err.message).includes("UNIQUE")) {
        throw new HttpError(409, "An account with this email already exists. Try logging in.");
      }
      throw err;
    }

    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const address = email(body.email);
    const password = typeof body.password === "string" ? body.password : "";

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(address);
    const ok = user && password && (await verifyPassword(password, user.password_hash));
    if (!ok) throw new HttpError(401, "Incorrect email or password.");

    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
