import { Router } from "express";
import { db, transaction } from "../db.js";
import { HttpError, text, integer, oneOf } from "../lib/errors.js";
import { requireAuth, requireRole } from "../lib/auth.js";
import {
  ITEM_CATEGORIES,
  PAYMENT_METHODS,
  idFromCode,
  matchNgo,
  toDonationDto
} from "../lib/donations.js";

const router = Router();
router.use(requireAuth);

/** Donors see what they gave; NGO accounts see what was given to their organisation. */
function canView(user, row) {
  return user.role === "NGO" ? row.ngo === user.organization : row.user_id === user.id;
}

router.get("/", (req, res) => {
  const rows =
    req.user.role === "NGO"
      ? db
          .prepare("SELECT * FROM donations WHERE ngo = ? ORDER BY created_at DESC, id DESC")
          .all(req.user.organization)
      : db
          .prepare("SELECT * FROM donations WHERE user_id = ? ORDER BY created_at DESC, id DESC")
          .all(req.user.id);

  res.json({ donations: rows.map(toDonationDto) });
});

router.get("/:code", (req, res) => {
  const id = idFromCode(req.params.code);
  const row = id === null ? null : db.prepare("SELECT * FROM donations WHERE id = ?").get(id);

  // Same answer for "doesn't exist" and "not yours" so IDs can't be probed.
  if (!row || !canView(req.user, row)) throw new HttpError(404, "No donation found with that ID.");
  res.json({ donation: toDonationDto(row) });
});

router.post("/", requireRole("Donor"), (req, res) => {
  const body = req.body || {};
  const id = body.type === "Money" ? createMoneyDonation(req.user, body) : createItemDonation(req.user, body);
  const row = db.prepare("SELECT * FROM donations WHERE id = ?").get(id);
  res.status(201).json({ donation: toDonationDto(row) });
});

/* ---------------- money ---------------- */

function createMoneyDonation(user, body) {
  const campaignId = integer(body.campaignId, "Campaign", { min: 1 });
  const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);
  if (!campaign) throw new HttpError(404, "That campaign no longer exists.");

  const amount = integer(body.amount, "Amount", { min: 10, max: 1000000 });
  // Only the *method* is stored. Card numbers, CVV and UPI IDs never reach the server.
  const method = oneOf(body.paymentMethod, "Payment method", PAYMENT_METHODS);

  return transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO donations (user_id, type, item, quantity, ngo, status, amount, payment_method,
                                campaign_id, anonymous, simulate, created_at)
         VALUES (?, 'Money', ?, 1, ?, 'Payment Successful', ?, ?, ?, ?, 0, ?)`
      )
      .run(user.id, campaign.title, campaign.ngo, amount, method, campaign.id, body.anonymous === true ? 1 : 0, Date.now());

    db.prepare("UPDATE campaigns SET raised = raised + ? WHERE id = ?").run(amount, campaign.id);
    return Number(result.lastInsertRowid);
  });
}

/* ---------------- items ---------------- */

function createItemDonation(user, body) {
  const type = oneOf(body.type, "Category", ITEM_CATEGORIES);
  const item = text(body.item, "Item name", { min: 2, max: 120 });
  const quantity = integer(body.quantity ?? 1, "Quantity", { min: 1, max: 10000 });
  const condition = oneOf(body.condition ?? "Good", "Condition", ["New", "Like New", "Good", "Used"]);
  const description = text(body.description, "Description", { required: false, max: 500 });
  const pickupAddress = text(body.pickupAddress, "Pickup address", { min: 5, max: 300 });
  const phone = text(body.phone, "Contact number", { min: 7, max: 20 });

  let ngo = text(body.ngo, "NGO", { required: false, max: 120 });
  if (ngo) {
    if (!db.prepare("SELECT 1 FROM ngos WHERE name = ?").get(ngo)) throw new HttpError(400, "Unknown NGO.");
  } else {
    ngo = matchNgo(type);
    if (!ngo) throw new HttpError(503, "No NGO is available to receive this donation right now.");
  }

  const result = db
    .prepare(
      `INSERT INTO donations (user_id, type, item, quantity, ngo, status, description, pickup_address,
                              phone, item_condition, simulate, created_at)
       VALUES (?, ?, ?, ?, ?, 'Donation Submitted', ?, ?, ?, ?, 1, ?)`
    )
    .run(user.id, type, item, quantity, ngo, description, pickupAddress, phone, condition, Date.now());

  return Number(result.lastInsertRowid);
}

export default router;
