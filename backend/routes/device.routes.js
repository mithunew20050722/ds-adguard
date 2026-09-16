const express = require("express");
const dns = require("dns").promises;
const Device = require("../models/Device");
const { requireAuth, requireInternalToken } = require("../middleware/auth");
const { COUNTRY_CURRENCY, convertPrice } = require("../utils/currency");
const { resolveDeviceStatuses, resolveDeviceStatus } = require("../utils/deviceStatus");
const { buildDeviceLink } = require("../utils/subdomain");

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

// GET /api/devices/:id  (single device — reflects real connect/disconnect status)
router.get("/:id", requireAuth, async (req, res) => {
  let device = await Device.findOne({ _id: req.params.id, owner: req.user._id });
  if (!device) return res.status(404).json({ error: "Device not found." });
  device = await resolveDeviceStatus(device);
  res.json({ device });
});

// POST /api/devices  (save a new device — link is generated immediately,
// no payment gate. Lifecycle: pending -> connected (once the proxy sees
// real DNS traffic for its link) -> disconnected if it goes quiet.)
router.post("/", requireAuth, async (req, res) => {
  try {
    const { imei, brand, protection } = req.body;

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

    const baseDomain = process.env.BASE_DOMAIN;
    if (!baseDomain) {
      return res.status(500).json({ error: "Server is missing BASE_DOMAIN config — set it before adding devices." });
    }

    // Practically unique on the first try; loop just in case of a rare clash.
    let token, link, exists = true;
    while (exists) {
      ({ token, link } = buildDeviceLink(baseDomain));
      exists = await Device.exists({ token });
    }

    const device = await Device.create({
      owner: req.user._id,
      imei,
      brand: brand.toUpperCase(),
      protection: {
        appAds: !!protection.appAds,
        backgroundAds: !!protection.backgroundAds,
      },
      token,
      link,
      status: "pending",
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

// ---------------------------------------------------------------------
// Internal endpoint — called ONLY by the DoT proxy server (on Oracle
// Cloud), never by a browser. Protected by a shared secret, not a login.
// ---------------------------------------------------------------------

// POST /api/devices/internal/heartbeat   body: { token, ip }
// Called every time the proxy relays a DNS query for a device's link.
// This is the real, auto-detected "this device just connected" signal —
// no manual step, no polling from the frontend needed.
router.post("/internal/heartbeat", requireInternalToken, async (req, res) => {
  try {
    const { token, ip } = req.body;
    if (!token) return res.status(400).json({ error: "token required" });

    const device = await Device.findOne({ token });
    if (!device) {
      // Someone put a made-up/expired hostname into their Private DNS.
      return res.status(404).json({ error: "Unknown device token" });
    }

    const isFirstConnection = !device.network.firstConnectedAt;

    if (isFirstConnection) {
      device.network.firstConnectedAt = new Date();
      device.network.pairedIp = ip || null;
      // Best-effort reverse DNS lookup — often reveals the ISP/network name
      // (e.g. "123.45.67.89.dialog.lk"), which is the closest thing to
      // "auto-detected device info" DNS-over-TLS can actually provide.
      if (ip) {
        dns.reverse(ip).then((hostnames) => {
          if (hostnames?.[0]) {
            Device.findByIdAndUpdate(device._id, { "network.reverseDns": hostnames[0] }).catch(() => {});
          }
        }).catch(() => {
          /* no PTR record — not every IP has one, that's normal */
        });
      }
    } else if (ip && device.network.pairedIp && ip !== device.network.pairedIp) {
      // Same link, different IP than the first time it connected. Mobile
      // carriers reassign IPs constantly, so we don't block this — we just
      // flag it so the shop can double check with the customer if needed.
      device.network.ipChanged = true;
    }

    device.network.ip = ip || device.network.ip;
    device.network.lastSeenAt = new Date();
    await device.save();

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not record heartbeat." });
  }
});

module.exports = router;
