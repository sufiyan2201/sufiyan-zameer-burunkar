import { Router } from "express";
import { db } from "../db.js";

const router = Router();

const toNgoDto = (row) => ({
  id: row.id,
  name: row.name,
  city: row.city,
  address: row.address,
  phone: row.phone,
  email: row.email,
  lat: row.lat,
  lng: row.lng,
  categories: JSON.parse(row.categories),
  requiredItems: row.required_items,
  priority: row.priority,
  verified: Boolean(row.verified),
  description: row.description
});

router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM ngos ORDER BY id").all();
  res.json({ ngos: rows.map(toNgoDto) });
});

export default router;
