// This file MUST be the first import in index.js: it checks the Node version
// and loads server/.env before any other module reads process.env.
import { fileURLToPath } from "node:url";
import path from "node:path";

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(
    `\nKindConnect needs Node.js 22.13 or newer (you have ${process.versions.node}).\n` +
      `Install the current LTS from https://nodejs.org or run: brew install node\n`
  );
  process.exit(1);
}

const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
try {
  process.loadEnvFile(envPath);
} catch {
  // No .env file yet - the defaults below are used (fine for local development).
}

export const config = {
  port: Number(process.env.PORT) || 4000,
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  jwtSecret: process.env.JWT_SECRET || "dev-only-secret-change-me",
  stageDurationMs: Number(process.env.STAGE_DURATION_MS) || 20000,
  isProduction: process.env.NODE_ENV === "production"
};

if (!process.env.JWT_SECRET) {
  if (config.isProduction) {
    console.error("JWT_SECRET must be set in production.");
    process.exit(1);
  }
  console.warn("[warn] JWT_SECRET is not set - using an insecure development default.");
}
