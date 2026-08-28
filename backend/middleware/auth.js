const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: "Login required." });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);

    if (!user) {
      return res.status(401).json({ error: "Account not found." });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access only." });
  }
  next();
}

// ---- Password-only admin gate (used by the separate /admin.html panel) ----
// No user account involved: enter the shop's admin password on /admin.html,
// get back a short-lived admin token, and every /api/admin/* route below
// checks that token instead of a logged-in User.
const jwtLib = require("jsonwebtoken");

function requireAdminToken(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Admin login required." });

    const payload = jwtLib.verify(token, process.env.JWT_SECRET);
    if (!payload.admin) return res.status(401).json({ error: "Admin login required." });

    next();
  } catch (err) {
    return res.status(401).json({ error: "Admin session expired. Log in again." });
  }
}

module.exports = { requireAuth, requireAdmin, requireAdminToken };
