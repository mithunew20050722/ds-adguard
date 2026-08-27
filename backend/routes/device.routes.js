const express = require("express");
const Device = require("../models/Device");
const { requireAuth } = require("../middleware/auth");
const { COUNTRY_CURRENCY, convertPrice } = require("../utils/currency");
const { resolveDeviceStatuses, resolveDeviceStatus } = require("../utils/deviceStatus");

const router = express.Router();

const KNOWN_BRANDS = [
  "SAMSUNG", "APPLE", "XIAOMI", "REDMI", "OPPO", "VIVO", "REALME",
  "HUAWEI", "HONOR", "ONEPLUS", "NOKIA", "MOTOROLA", "TECNO", "INFINIX",
  "ITEL", "ASUS", "GOOGLE", "SONY", "LG", "OTHER",
];

// GET /api/devices/brands
router.get("/brands", (req, res) => {
  res.json({ brands: KNOWN_BRANDS });
});

// GET /api/devices/countries
router.get("/countries", (req, res) => {
  const list = Object.entries(COUNTRY_CURRENCY).map(([code, v]) => ({
    code,
    currency: v.currency,
    symbol: v.symbol,
  }));
  res.json({ countries: list });
});

// GET /api/devices/price?country=US
router.get("/price", async (req, res) => {
  try {
    const base = Number(process.env.BASE_PRICE_LKR || 1500);
    const price = await convertPrice(req.query.country, base);
    res.json({ baseLKR: base, ...price });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not calculate price right now." });
  }
});

// GET /api/devices  (list current user's saved devices)
router.get("/", requireAuth, async (req, res) => {
  let devices = await Device.find({ owner: req.user._id }).sort({ createdAt: -1 });
  devices = await resolveDeviceStatuses(devices);
  res.json({ devices });
});

// GET /api/devices/:id  (single device — used by the frontend to poll while "connecting")
router.get("/:id", requireAuth, async (req, res) => {
  let device = await Device.findOne({ _id: req.params.id, owner: req.user._id });
  if (!device) return res.status(404).json({ error: "Device not found." });
  device = await resolveDeviceStatus(device);
  res.json({ device });
});

// POST /api/devices  (save a new device — created in pending_payment state.
// Lifecycle: pending_payment -> connecting (2-3 min, set by payment.routes.js
// once PayHere confirms payment) -> active, resolved lazily in the GET routes above)
router.post("/", requireAuth, async (req, res) => {
  try {
    const { imei, brand, protection, country } = req.body;

    if (!imei || !/^\d{14,17}$/.test(imei)) {
      return res.status(400).json({ error: "Enter a valid IMEI (14-17 digits)." });
    }
    if (!brand) {
      return res.status(400).json({ error: "Select or enter a phone brand." });
    }
    if (!protection || (!protection.appAds && !protection.backgroundAds)) {
      return res.status(400).json({ error: "Select at least one protection type." });
    }

    const already = await Device.findOne({ owner: req.user._id, imei });
    if (already) {
      return res.status(409).json({ error: "This IMEI is already registered on your account." });
    }

    const base = Number(process.env.BASE_PRICE_LKR || 1500);
    const price = await convertPrice(country || req.user.country, base);

    const device = await Device.create({
      owner: req.user._id,
      imei,
      brand: brand.toUpperCase(),
      protection: {
        appAds: !!protection.appAds,
        backgroundAds: !!protection.backgroundAds,
      },
      pricing: {
        amountLKR: base,
        amountCharged: price.amount,
        currency: price.currency,
        country: price.country,
      },
      status: "pending_payment",
    });

    res.status(201).json({ device });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not save device. Try again." });
  }
});

// DELETE /api/devices/:id
router.delete("/:id", requireAuth, async (req, res) => {
  const device = await Device.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
  if (!device) return res.status(404).json({ error: "Device not found." });
  res.json({ ok: true });
});

module.exports = router;
