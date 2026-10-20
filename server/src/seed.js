import { db, transaction } from "./db.js";
import { hashPassword } from "./lib/auth.js";
import { ngoSeed, campaignSeed } from "./seed-data.js";

export const DEMO_ACCOUNTS = {
  donor: { name: "Demo Donor", email: "donor@kindconnect.dev", password: "Donor@123" },
  ngo: {
    name: "Demo NGO Admin",
    email: "ngo@kindconnect.dev",
    password: "Ngo@12345",
    organization: "Children Education Foundation"
  }
};

/** Fills an empty database with the starter NGOs, campaigns and two demo accounts. */
export async function seedIfEmpty() {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM ngos").get();
  if (count > 0) return false;

  const donorHash = await hashPassword(DEMO_ACCOUNTS.donor.password);
  const ngoHash = await hashPassword(DEMO_ACCOUNTS.ngo.password);
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  transaction(() => {
    const insertNgo = db.prepare(
      `INSERT INTO ngos (id, name, city, address, phone, email, lat, lng, categories,
                         required_items, priority, verified, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const n of ngoSeed) {
      insertNgo.run(
        n.id, n.name, n.city, n.address, n.phone, n.email, n.lat, n.lng,
        JSON.stringify(n.categories), n.requiredItems, n.priority, n.verified ? 1 : 0, n.description
      );
    }

    const insertCampaign = db.prepare(
      `INSERT INTO campaigns (id, title, ngo, category, target, raised, priority, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const c of campaignSeed) {
      insertCampaign.run(c.id, c.title, c.ngo, c.category, c.target, c.raised, c.priority, c.description, now);
    }

    const insertUser = db.prepare(
      `INSERT INTO users (name, email, phone, password_hash, role, organization, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const donor = insertUser.run(
      DEMO_ACCOUNTS.donor.name, DEMO_ACCOUNTS.donor.email, "+91 98765 00001", donorHash, "Donor", null, now
    );
    insertUser.run(
      DEMO_ACCOUNTS.ngo.name, DEMO_ACCOUNTS.ngo.email, "+91 98765 00002", ngoHash, "NGO",
      DEMO_ACCOUNTS.ngo.organization, now
    );

    // Two sample donations so the demo donor's dashboard is not empty (DON-1001, DON-1002).
    const insertDonation = db.prepare(
      `INSERT INTO donations (user_id, type, item, quantity, ngo, status, amount, payment_method,
                              campaign_id, simulate, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    );
    insertDonation.run(
      donor.lastInsertRowid, "Books", "School Books", 10, "Children Education Foundation",
      "Delivered", 0, null, null, now - 45 * day
    );
    insertDonation.run(
      donor.lastInsertRowid, "Money", "Education for Every Child", 1, "Children Education Foundation",
      "Payment Successful", 2500, "UPI", 1, now - 47 * day
    );
  });

  return true;
}
