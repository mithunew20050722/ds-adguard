# Private DNS AdGuard — Control Panel

Customer-facing control panel for the DNS ad-block setup service. Customers register, add a device (IMEI + brand), and get a unique Private DNS link **auto-generated immediately** — no payment gate yet (that's coming later). Their device's status (pending → connected → disconnected) is tracked automatically from real DNS traffic, not a fake timer.

```
private-dns-adguard/
├── backend/     Node.js + Express + MongoDB API (deploy on Vercel)
├── frontend/    Plain HTML/CSS/JS control panel (no build step)
└── dot-proxy/   DNS-over-TLS relay (deploy on an Oracle Cloud "Always Free" VM)
```

## How ad-blocking actually works here

A device's Private DNS link (`<token>.yourdomain.eu.org`) points at **your own proxy server** (`dot-proxy/`), not directly at AdGuard. The proxy relays every DNS query as-is to AdGuard's real, free public server (`dns.adguard.com`) and relays the answer back — so filtering is 100% AdGuard's, and because traffic passes through your proxy first, you can see exactly when a device connects or goes quiet.

**Two different places to deploy:**
- `backend/` + `frontend/` → **Vercel** (HTTP-only, already configured via the existing `vercel.json`)
- `dot-proxy/` → **Oracle Cloud "Always Free" VM** (needs a persistent TCP/TLS listener on port 853, which Vercel/serverless platforms cannot provide)

See `dot-proxy/.env.example` and the Oracle deployment steps further down for wiring the two together.

## 1. Backend setup

```
cd backend && npm install
```

Copy `.env.example` to `.env` and fill in:

- `MONGODB_URI` — your MongoDB connection string (Atlas or self-hosted)
- `JWT_SECRET` — any long random string
- `BASE_DOMAIN` — your eu.org (or other) domain, e.g. `nmdandds.eu.org`
- `INTERNAL_API_TOKEN` — random string, must match the same value in `dot-proxy/.env` on the Oracle VM
- `TEST_ACTIVATE_CODE` — the password customers/staff enter to reveal a device's link (Copy + OK screen)
- `PAYHERE_MERCHANT_ID` / `PAYHERE_MERCHANT_SECRET` — from PayHere dashboard → Settings & Domains. Not required yet — payment is being added later; devices work without it.

Run it:

```
npm run dev
```

API runs on `http://localhost:5000` by default. Health check: `GET /api/health`.

## New device lifecycle (no payment gate yet)

1. Customer/staff fills in IMEI + brand + protection type in the 2-step wizard → `POST /api/devices` creates the device **and auto-generates its link** immediately (`status: "pending"`).
2. A password prompt (same `TEST_ACTIVATE_CODE` gate as before) reveals the link in a Copy + OK screen. Whether OK is clicked or the screen is dismissed, the device stays saved as "pending" — nothing is lost.
3. The link is pasted into the device's Private DNS setting.
4. Once `dot-proxy/` (on the Oracle VM) actually sees DNS traffic for that link, it calls back into the API (`POST /api/devices/internal/heartbeat`) — status flips to **"connected"** automatically, and the device's IP + a best-effort reverse-DNS lookup are saved as auto-detected network info (IMEI/phone model still can't be auto-detected — that's a DNS protocol limitation, not a bug).
5. If no heartbeat arrives for `DISCONNECT_AFTER_MINUTES` (default 3), the device shows as **"disconnected"** the next time anyone loads the device list — computed on read, no background job required (works fine on Vercel's serverless model).
6. A link is loosely "paired" to the IP it first connected from. If it later connects from a different IP, that's flagged (`ipChanged`) rather than blocked outright — mobile carriers reassign IPs constantly, so hard-blocking would lock out legitimate reconnects.

## 2. The DoT proxy (`dot-proxy/`) is a SEPARATE package

This repo only has `backend/` + `frontend/` — the actual DNS-over-TLS relay that customers' phones connect to lives in its own separate package (deployed on an Oracle Cloud "Always Free" VM, not Vercel, since it needs a persistent TCP/TLS listener on port 853). Set `BASE_DOMAIN` and `INTERNAL_API_TOKEN` here to match that package's `.env` exactly.

## 3. Frontend setup

No build step — it's plain HTML/CSS/JS. Open `frontend/index.html` directly, or serve it:

```
cd frontend && npx serve .
```

In `frontend/index.html`, update this line to point at your backend once deployed:

```html
<script>window.API_BASE = "http://localhost:5000/api";</script>
```

## 4. How pricing/currency works (for when payment is wired up later)

- `BASE_PRICE_LKR` in `.env` is the one number you control (default 1500).
- `backend/utils/currency.js` maps country → currency (`LK→LKR`, `US→USD`, `JP→JPY`, EU countries → `EUR`, etc.) and fetches a live exchange rate to convert the base price. Add more countries by adding a row to `COUNTRY_CURRENCY`.
- If the live rate API is unreachable, it falls back to approximate rates baked into the file so pricing never breaks — update `FALLBACK_RATES_FROM_LKR` occasionally.
- Each device stores the exact amount and currency it was priced at, so past orders don't shift if rates change later.

## 5. Payment flow (not wired up yet — devices work without it)

- Devices currently get their link for free, no payment step. The routes below are scaffolded and ready for whenever payment gets added, but nothing in the current UI calls them.
- **LKR (Sri Lanka)**: `POST /api/payments/payhere/init` creates an order and returns a signed payload for PayHere Checkout. PayHere calls `POST /api/payments/payhere/notify` server-to-server when payment completes — that's the trigger point once payment is turned on. Never trust the browser return URL alone for marking something paid.
- **Other currencies (USD/EUR/GBP/etc.)**: PayHere settles in LKR only, so foreign-currency cards will need a separate gateway — Stripe is the natural fit. The wiring plan is documented in `backend/routes/payment.routes.js` but not implemented yet.
- **Important**: `notify_url` must be reachable from the public internet (not `localhost`) for PayHere to call it — the Vercel deployment already satisfies this.

## 6. Device status lifecycle

`pending` (link generated, not yet connected) → **`connected`** (a real DNS-over-TLS heartbeat arrived from the `dot-proxy` server within the last `DISCONNECT_AFTER_MINUTES`) → **`disconnected`** (gone quiet past that window). This is genuine detection, not a simulated timer — status is recalculated every time the device list is read (`backend/utils/deviceStatus.js`), so no background job is needed and it works fine on Vercel's serverless model.

## 7. What you provide

- ✅ MongoDB connection string — already in `backend/.env`
- PayHere merchant ID + secret (sandbox first, then live)
- A domain/hosting for both frontend and backend

**Note on the MongoDB URI you shared in chat**: it's saved in `backend/.env` (not committed anywhere). Since `ds-arcade`/`ds-arcade` looks like a simple username/password and it's now been pasted into a chat log, it's worth rotating that Atlas database user's password once things are running smoothly — same practice as with the GitHub token. Also, the URI points at the `ds-arcade` database, which your WhatsApp bots also use — collections are named differently (`users`, `devices`, `orders` for this project) so there's no clash, but if you'd rather keep it fully separate, just change the database name in the URI path (e.g. `.../private-dns-adguard?appName=Cluster0`).

## Notes on the honesty of this panel

Every label describes exactly what's configured (in-app ads / background ads block via DNS), no manufactured urgency or fake stats — matches the "no false claims" approach you described.
