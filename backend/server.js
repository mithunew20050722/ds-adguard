require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");

const authRoutes = require("./routes/auth.routes");
const deviceRoutes = require("./routes/device.routes");
const paymentRoutes = require("./routes/payment.routes");
const adminRoutes = require("./routes/admin.routes");

const app = express();

// Vercel runs this behind a proxy — needed so express-rate-limit can read
// the real client IP from X-Forwarded-For instead of throwing.
app.set("trust proxy", 1);

connectDB().catch((err) => {
  console.error("Startup DB connection failed (will retry per-request):", err.message);
});

// Every /api request waits for the (cached) DB connection before hitting a
// route. On a cold start the connection from the line above may not be
// ready yet -- without this, requests would fail with a generic DB error
// instead of just waiting the extra moment for the connection.
app.use("/api", async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("DB connection failed:", err.message);
    res.status(503).json({ error: "Database unavailable. Please try again in a moment." });
  }
});

app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());

// Basic protection against brute-force login/register attempts
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
app.use("/api/auth", authLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/devices", deviceRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/admin", adminRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Serve the frontend dashboard (frontend/index.html etc.) at the root
app.use(express.static(path.join(__dirname, "../frontend")));

// Anything under /api that didn't match a route -> JSON 404
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// Anything else not matched (and not an existing static file) -> serve the dashboard
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our end." });
});

const PORT = process.env.PORT || 5000;

// Only start a listening server when run directly (local dev / a normal host).
// On Vercel this file is loaded as a serverless function instead, so it just
// exports `app` and Vercel handles the listening part.
if (require.main === module) {
  app.listen(PORT, () => console.log(`Private DNS AdGuard API running on port ${PORT}`));
}

module.exports = app;
