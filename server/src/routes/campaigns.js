import { Router } from "express";
import { db } from "../db.js";
import { text, integer, oneOf } from "../lib/errors.js";
import { requireAuth, requireRole } from "../lib/auth.js";
import { CAMPAIGN_CATEGORIES, PRIORITIES } from "../lib/donations.js";

const router = Router();

const toCampaignDto = (row) => ({
  id: row.id,
  title: row.title,
  ngo: row.ngo,
  category: row.category,
  target: row.target,
  raised: row.raised,
  priority: row.priority,
  description: row.description
});

router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM campaigns ORDER BY id").all();
  res.json({ campaigns: rows.map(toCampaignDto) });
});

router.post("/", requireAuth, requireRole("NGO"), (req, res) => {
  const body = req.body || {};

  const title = text(body.title, "Campaign title", { min: 3, max: 120 });
  const category = oneOf(body.category, "Category", CAMPAIGN_CATEGORIES);
  const target = integer(body.target, "Target amount", { min: 100, max: 100000000 });
  const priority = oneOf(body.priority, "Priority", PRIORITIES);
  const description = text(body.description, "Description", { min: 10, max: 500 });

  const result = db
    .prepare(
      `INSERT INTO campaigns (title, ngo, category, target, priority, description, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(title, req.user.organization, category, target, priority, description, req.user.id, Date.now());

  const row = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(Number(result.lastInsertRowid));
  res.status(201).json({ campaign: toCampaignDto(row) });
});

export default router;
