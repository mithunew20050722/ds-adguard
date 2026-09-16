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

// ---- Internal-only gate for the DoT proxy server ----
// Not a user or admin login — a shared secret between this API and the
// separate proxy process that actually relays customer DNS traffic. The
// proxy calls POST /api/devices/internal/heartbeat using this token
// whenever it sees traffic for a device's link.
function requireInternalToken(req, res, next) {
  const token = req.headers["x-internal-token"];
  if (!token || token !== process.env.INTERNAL_API_TOKEN) {
    return res.status(403).json({ error: "Forbidden." });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireAdminToken, requireInternalToken };
