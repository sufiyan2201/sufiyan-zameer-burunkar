import { config } from "../env.js";
import { db } from "../db.js";

export const ITEM_CATEGORIES = ["Clothes", "Books", "Dry Food", "Toys", "Healthcare", "Other"];
export const CAMPAIGN_CATEGORIES = ["Books", "Clothes", "Dry Food", "Healthcare", "Toys"];
export const PRIORITIES = ["High", "Medium", "Low"];
export const PAYMENT_METHODS = ["UPI", "Card", "Netbanking"];

export const ITEM_STAGES = [
  "Donation Submitted",
  "NGO Matched",
  "Pickup Scheduled",
  "In Transit",
  "Delivered"
];

const CODE_OFFSET = 1000; // row id 1 -> DON-1001

export const donationCode = (id) => `DON-${CODE_OFFSET + id}`;

export function idFromCode(code) {
  const match = /^DON-(\d+)$/i.exec(String(code).trim());
  return match ? Number(match[1]) - CODE_OFFSET : null;
}

/**
 * Item donations in demo mode move through the stages on their own, one stage
 * every STAGE_DURATION_MS. To drive statuses from real NGO updates instead,
 * store the stage in `status` and set simulate = 0 when the donation is created.
 */
export function currentStatus(row, now = Date.now()) {
  if (!row.simulate) return row.status;
  const stage = Math.floor((now - row.created_at) / config.stageDurationMs);
  return ITEM_STAGES[Math.max(0, Math.min(ITEM_STAGES.length - 1, stage))];
}

export function toDonationDto(row) {
  return {
    id: donationCode(row.id),
    type: row.type,
    item: row.item,
    quantity: row.quantity,
    ngo: row.ngo,
    status: currentStatus(row),
    amount: row.amount,
    paymentMethod: row.payment_method || null,
    createdAt: row.created_at
  };
}

const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 };

/** "Let us match me": pick a verified NGO that accepts this category, most urgent first. */
export function matchNgo(category) {
  const rows = db.prepare("SELECT name, categories, priority, verified FROM ngos ORDER BY id").all();
  const candidates = rows
    .filter((n) => n.verified && JSON.parse(n.categories).includes(category))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  return candidates[0]?.name || rows.find((n) => n.verified)?.name || null;
}
