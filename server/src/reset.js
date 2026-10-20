// npm run reset-db  ->  deletes the SQLite files so the next start re-creates and re-seeds everything.
import fs from "node:fs";
import "./env.js";
import { dbPath } from "./db.js";

for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
  if (fs.existsSync(file)) fs.rmSync(file);
}
console.log("Database deleted. It will be recreated with the starter data on the next start.");
process.exit(0);
