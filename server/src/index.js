import { config } from "./env.js"; // must stay the first import (loads .env, checks Node version)
import { dbPath } from "./db.js";
import { seedIfEmpty, DEMO_ACCOUNTS } from "./seed.js";
import { createApp } from "./app.js";

if (await seedIfEmpty()) {
  console.log("Empty database - loaded starter NGOs, campaigns and demo accounts.");
}

const server = createApp().listen(config.port, () => {
  console.log(`\nKindConnect API running at http://localhost:${config.port}`);
  console.log(`Database file: ${dbPath}`);
  console.log(`Demo donor: ${DEMO_ACCOUNTS.donor.email} / ${DEMO_ACCOUNTS.donor.password}`);
  console.log(`Demo NGO:   ${DEMO_ACCOUNTS.ngo.email} / ${DEMO_ACCOUNTS.ngo.password}\n`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\nPort ${config.port} is already in use. Stop the other process or change PORT in server/.env.\n` +
        `Find it with:  lsof -i :${config.port}\n`
    );
    process.exit(1);
  }
  throw err;
});
