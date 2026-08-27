# Private DNS AdGuard — Control Panel

Customer-facing control panel for the DNS ad-block setup service. Customers register, add a device (IMEI + brand), see the price auto-converted to their local currency, pay, and you track device status (pending → active) from the database.

```
private-dns-adguard/
├── backend/     Node.js + Express + MongoDB API
└── frontend/    Plain HTML/CSS/JS control panel (no build step)
```

## 1. Backend setup

```
cd backend && npm install
```

Copy `.env.example` to `.env` and fill in:

- `MONGODB_URI` — your MongoDB connection string (Atlas or self-hosted)
- `JWT_SECRET` — any long random string
- `BASE_PRICE_LKR` — 1500 by default, change any time
- `PAYHERE_MERCHANT_ID` / `PAYHERE_MERCHANT_SECRET` — from PayHere dashboard → Settings → Domains & Credentials. Use `PAYHERE_MODE=sandbox` for testing, `live` when ready.

Run it:

```
npm run dev
```

API runs on `http://localhost:5000` by default. Health check: `GET /api/health`.

## 2. Frontend setup

No build step — it's plain HTML/CSS/JS. Open `frontend/index.html` directly, or serve it:

```
cd frontend && npx serve .
```

In `frontend/index.html`, update this line to point at your backend once deployed:

```html
<script>window.API_BASE = "http://localhost:5000/api";</script>
```

## 3. How pricing/currency works

- `BASE_PRICE_LKR` in `.env` is the one number you control (default 1500).
- `backend/utils/currency.js` maps country → currency (`LK→LKR`, `US→USD`, `JP→JPY`, EU countries → `EUR`, etc.) and fetches a live exchange rate to convert the base price. Add more countries by adding a row to `COUNTRY_CURRENCY`.
- If the live rate API is unreachable, it falls back to approximate rates baked into the file so pricing never breaks — update `FALLBACK_RATES_FROM_LKR` occasionally.
- Each device stores the exact amount and currency it was priced at, so past orders don't shift if rates change later.

## 4. Payment flow

- **LKR (Sri Lanka)**: uses PayHere Checkout. `POST /api/payments/payhere/init` creates an order and returns a signed payload; the frontend auto-submits a form to PayHere's checkout page. PayHere calls `POST /api/payments/payhere/notify` server-to-server when payment completes — that's what actually marks the device `pending_setup`. This is intentional: never trust the browser return URL alone for marking something paid.
- **Other currencies (USD/EUR/GBP/etc.)**: PayHere settles in LKR, so foreign-currency cards need a separate gateway — Stripe is the natural fit. The route file (`backend/routes/payment.routes.js`) has the wiring plan documented but not implemented, since it needs your own Stripe account keys. Ask me to build it out once you've created the Stripe account.
- **Important**: `notify_url` must be reachable from the public internet (not `localhost`) for PayHere to call it — deploy the backend somewhere with a public URL (a VPS, Render, Railway, etc.) before going live, or use a tunnel like ngrok while testing.

## 5. Device status lifecycle

`pending_payment` → **`connecting`** (starts the moment PayHere confirms payment; the dashboard shows a live 2–3 minute countdown, randomised per device) → **`active`** ("Connected", flips automatically once the countdown ends — no cron job needed, it's resolved lazily whenever the device list is fetched) → `expired`/`failed` as needed.

The connecting window length is set in `backend/utils/deviceStatus.js` (`MIN_CONNECT_MS` / `MAX_CONNECT_MS`, currently 2–3 minutes).

## 6. What you provide

- ✅ MongoDB connection string — already in `backend/.env`
- PayHere merchant ID + secret (sandbox first, then live)
- A domain/hosting for both frontend and backend

**Note on the MongoDB URI you shared in chat**: it's saved in `backend/.env` (not committed anywhere). Since `ds-arcade`/`ds-arcade` looks like a simple username/password and it's now been pasted into a chat log, it's worth rotating that Atlas database user's password once things are running smoothly — same practice as with the GitHub token. Also, the URI points at the `ds-arcade` database, which your WhatsApp bots also use — collections are named differently (`users`, `devices`, `orders` for this project) so there's no clash, but if you'd rather keep it fully separate, just change the database name in the URI path (e.g. `.../private-dns-adguard?appName=Cluster0`).

## Notes on the honesty of this panel

Every label describes exactly what's configured (in-app ads / background ads block via DNS), no manufactured urgency or fake stats — matches the "no false claims" approach you described.
