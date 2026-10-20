# KindConnect — React + Express + SQLite

Your KindConnect front-end now has a real backend: accounts, NGOs, campaigns and donations are stored in a database instead of the browser's localStorage.

```
kindconnect/
├── client/   React (Vite) app  – your App.jsx / App.css, plus src/api.js
├── server/   Express API + SQLite database (created automatically on first run)
└── package.json   one-command scripts for the whole project
```

---

## Run it in VS Code on a Mac

### 1. Install Node.js (one time)
Open **Terminal** (⌘ Space → "Terminal") and check:

```bash
node -v
```

You need **v22.13 or newer**. If you see "command not found" or an older version, install the current LTS:

- Download from https://nodejs.org (the macOS installer), **or**
- with Homebrew: `brew install node`

Close and re-open Terminal / VS Code afterwards, then run `node -v` again.

### 2. Open the project in VS Code
1. Unzip `kindconnect.zip`.
2. In VS Code: **File → Open Folder…** (⌘O) and choose the `kindconnect` folder (the one that contains `client` and `server`).
3. Open the built-in terminal: **Terminal → New Terminal** (or ⌃\`).

### 3. Install everything (one time)

```bash
npm run setup
```

This installs the root, server and client packages and creates `server/.env` with a random secret. It takes a minute or two.

### 4. Start the app

```bash
npm run dev
```

(or press **⇧⌘B** in VS Code and choose *Start KindConnect*.)

You should see two coloured log streams:

```
[api] KindConnect API running at http://localhost:4000
[web] Local:   http://localhost:5173/
```

### 5. Use it
Open **http://localhost:5173** (⌘-click the link in the terminal).

| Account | Email | Password |
|---|---|---|
| Donor | `donor@kindconnect.dev` | `Donor@123` |
| NGO (Children Education Foundation) | `ngo@kindconnect.dev` | `Ngo@12345` |

Or click **Create an account** to register your own donor or NGO.

### 6. Stop / restart
- Stop: click the terminal and press **⌃C**.
- Start again any time with `npm run dev` (your data is kept).
- Start over with fresh demo data: `npm run reset-db`, then `npm run dev`.

---

## Already have your own Vite project?

Copy these into it instead of using the `client/` folder:

| From this zip | Put it at |
|---|---|
| `client/src/App.jsx` | `src/App.jsx` (replace) |
| `client/src/App.css` | `src/App.css` (replace – your original styles plus a few new rules at the bottom) |
| `client/src/api.js` | `src/api.js` (new) |
| `client/vite.config.js` | merge the `server.proxy` block into yours |

Then run the `server/` folder separately (`cd server && npm install && npm run dev`) and `npm run dev` in your Vite project.

---

## What changed in the app

| Before (localStorage) | Now (backend) |
|---|---|
| Login only needed a name | Real accounts: email + password, hashed with scrypt, login token (JWT) |
| NGOs / campaigns were hard-coded | Stored in the database (seeded with your original 15 NGOs and 6 campaigns) |
| Donations only lived in one browser | Stored per user; donor sees their own, NGO sees those given to its organisation |
| Donating money didn't change campaigns | Campaign "raised" total goes up (saved in the same transaction as the donation) |
| "Create campaign" did nothing | NGO accounts create real campaigns |
| Status progression was a timer in the browser | The server decides the stage; the page re-checks every 4 s |
| "Let us match me" always chose Helping Hands | Server picks a verified NGO that accepts the category, most urgent first |

Card numbers, CVV and UPI IDs are **never sent to the server** – only the payment method name is.

## API

All routes are under `/api`. Send `Authorization: Bearer <token>` where login is required.

| Method & path | Who | What |
|---|---|---|
| `POST /auth/register` | anyone | Create account (`role`: Donor or NGO; NGO needs `organization`) |
| `POST /auth/login` | anyone | Returns `{ token, user }` |
| `GET /auth/me` | logged in | Current user |
| `GET /ngos` | anyone | All NGOs |
| `GET /campaigns` | anyone | All campaigns |
| `POST /campaigns` | NGO | Create a campaign for your organisation |
| `GET /donations` | logged in | Donor: own donations · NGO: donations to its organisation |
| `GET /donations/:id` | logged in | One donation, e.g. `DON-1001` (404 if it isn't yours) |
| `POST /donations` | Donor | Item donation, or `{ "type": "Money", "campaignId", "amount", "paymentMethod" }` |

Quick test without the website:

```bash
curl http://localhost:4000/api/campaigns
```

## Looking inside the database

The data is one file: `server/data/kindconnect.db`. macOS already has the `sqlite3` command:

```bash
sqlite3 server/data/kindconnect.db "SELECT id, type, item, ngo, amount FROM donations;"
```

Or install a SQLite viewer extension in VS Code (search "SQLite Viewer" in the Extensions panel) and click the `.db` file.

## Troubleshooting

| Problem | Fix |
|---|---|
| `zsh: command not found: npm` | Node isn't installed (or the terminal was open during install). Install it, then restart VS Code. |
| "KindConnect needs Node.js 22.13 or newer" | Update Node (see step 1). `node:sqlite` is built into Node 22.13+, so there's no database to install. |
| Red banner "Cannot reach the server" | The API isn't running. Look at the `[api]` lines in the terminal for the error. |
| `Port 4000 is already in use` / `EADDRINUSE` | `lsof -i :4000` shows the process ID; stop it with `kill <PID>`, or change `PORT` in `server/.env` **and** the proxy `target` in `client/vite.config.js`. |
| Why not port 5000? | On recent macOS, AirPlay Receiver uses port 5000, so this project uses 4000 instead. |
| `ExperimentalWarning: SQLite is an experimental feature` | Normal on current Node versions; safe to ignore. |
| `EACCES` / permission errors during install | Don't use `sudo`. Make sure you opened a folder you own (e.g. in Documents), not a system folder. |
| Changed `server/.env` but nothing happened | Restart `npm run dev` (the server only reads `.env` on start). |

## Good to know (for your viva / report)

- **Payments are simulated** (as in your original). Nothing is charged. A real gateway such as Razorpay would verify payments on the server.
- **Item tracking is simulated.** Each stage lasts `STAGE_DURATION_MS` (20 s by default, set in `server/.env`). `currentStatus()` in `server/src/lib/donations.js` is the single place to replace with real NGO-driven updates.
- **NGO accounts aren't verified.** Anyone can register as any organisation name. A real deployment would need admin approval.
- Login tokens are kept in `localStorage` and last 7 days.
