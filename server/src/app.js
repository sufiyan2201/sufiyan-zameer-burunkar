import express from "express";
import cors from "cors";
import { config } from "./env.js";
import authRoutes from "./routes/auth.js";
import ngoRoutes from "./routes/ngos.js";
import campaignRoutes from "./routes/campaigns.js";
import donationRoutes from "./routes/donations.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.clientOrigin }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRoutes);
  app.use("/api/ngos", ngoRoutes);
  app.use("/api/campaigns", campaignRoutes);
  app.use("/api/donations", donationRoutes);

  app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") {
      return res.status(400).json({ error: "The request body is not valid JSON." });
    }
    if (err.type === "entity.too.large") {
      return res.status(413).json({ error: "The request body is too large." });
    }
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? "Something went wrong on the server." : err.message });
  });

  return app;
}
