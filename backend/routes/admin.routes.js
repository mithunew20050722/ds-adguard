const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Device = require("../models/Device");
const Order = require("../models/Order");
const { requireAdminToken } = require("../middleware/auth");

const router = express.Router();

// The admin password. Set ADMIN_PASSWORD in .env to override this — but it
// works out of the box with the default below, no setup step needed.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Nimesha00@@";

// POST /api/admin/login  { password }
// No email, no separate admin account — just the shop password. Returns a
// short-lived admin token used for every other /api/admin/* call.
router.post("/login", (req, res) => {
  const { password } = req.body;
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Incorrect admin password." });
  }
  const token = jwt.sign({ admin: true }, process.env.JWT_SECRET, { expiresIn: "12h" });
  res.json({ token });
});

// Everything below requires that admin token
router.use(requireAdminToken);

// GET /api/admin/users  (list all customers, with device counts)
router.get("/users", async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    const counts = await Device.aggregate([{ $group: { _id: "$owner", count: { $sum: 1 } } }]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));

    res.json({
      users: users.map((u) => ({
        ...u.toSafeObject(),
        deviceCount: countMap.get(String(u._id)) || 0,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load users." });
  }
});

// GET /api/admin/users/:id  (one user + their devices + their orders)
router.get("/users/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found." });

    const [devices, orders] = await Promise.all([
      Device.find({ owner: user._id }).sort({ createdAt: -1 }),
      Order.find({ owner: user._id }).sort({ createdAt: -1 }),
    ]);

    res.json({ user: user.toSafeObject(), devices, orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load user." });
  }
});

// PUT /api/admin/users/:id  (edit a customer's own details, verify email manually, change role)
router.put("/users/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found." });

    const { name, phone, country, emailVerified, role } = req.body;
    if (name !== undefined) user.name = name.trim();
    if (phone !== undefined) user.phone = phone.trim();
    if (country !== undefined) user.country = country;
    if (emailVerified !== undefined) user.emailVerified = !!emailVerified;
    if (role !== undefined) {
      if (!["customer", "admin"].includes(role)) {
        return res.status(400).json({ error: "Role must be customer or admin." });
      }
      user.role = role;
    }

    await user.save();
    res.json({ user: user.toSafeObject() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update user." });
  }
});

// DELETE /api/admin/users/:id  (removes the account and all their devices/orders)
router.delete("/users/:id", async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found." });

    await Promise.all([
      Device.deleteMany({ owner: user._id }),
      Order.deleteMany({ owner: user._id }),
    ]);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete user." });
  }
});

// PUT /api/admin/devices/:id  (manually change a device's status / DNS setup note)
router.put("/devices/:id", async (req, res) => {
  try {
    const device = await Device.findById(req.params.id);
    if (!device) return res.status(404).json({ error: "Device not found." });

    const { status, note } = req.body;
    if (status !== undefined) {
      const allowed = ["pending_payment", "connecting", "active", "failed", "expired"];
      if (!allowed.includes(status)) {
        return res.status(400).json({ error: "Invalid status." });
      }
      device.status = status;
      if (status === "active") {
        device.dnsProfile.configured = true;
        device.dnsProfile.configuredAt = new Date();
        device.connectingUntil = undefined;
      }
    }
    if (note !== undefined) device.dnsProfile.note = note;

    await device.save();
    res.json({ device });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update device." });
  }
});

// DELETE /api/admin/devices/:id
router.delete("/devices/:id", async (req, res) => {
  try {
    const device = await Device.findByIdAndDelete(req.params.id);
    if (!device) return res.status(404).json({ error: "Device not found." });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete device." });
  }
});

module.exports = router;
