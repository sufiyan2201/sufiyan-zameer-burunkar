// Creates server/.env from .env.example (with a fresh random JWT secret) if it doesn't exist yet.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const dir = path.join(__dirname, "..", "server");
const target = path.join(dir, ".env");

if (fs.existsSync(target)) {
  console.log("server/.env already exists - leaving it alone.");
} else {
  const example = fs.readFileSync(path.join(dir, ".env.example"), "utf8");
  const secret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(target, example.replace("change-this-to-a-long-random-string", secret));
  console.log("Created server/.env with a new random JWT secret.");
}
