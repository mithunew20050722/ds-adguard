require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");

const authRoutes = require("./routes/auth.routes");
const deviceRoutes = require("./routes/device.routes");
const paymentRoutes = require("./routes/payment.routes");

const app = express();

connectDB();

app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());

// Basic protection against brute-force login/register attempts
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
app.use("/api/auth", authLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/devices", deviceRoutes);
app.use("/api/payments", paymentRoutes);

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
app.listen(PORT, () => console.log(`Private DNS AdGuard API running on port ${PORT}`));
