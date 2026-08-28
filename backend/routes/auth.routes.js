const express = require("express");
const jwt = require("jsonwebtoken");
const validator = require("validator");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");
const { sendPasswordResetOtp, sendVerificationOtp } = require("../utils/mailer");

const router = express.Router();

function signToken(user) {
  return jwt.sign({ sub: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

function genOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

// POST /api/auth/register
// Creates the account as unverified, emails a 6-digit code, and does NOT log
// the user in yet. The frontend must call /verify-email with that code before
// a token is issued.
router.post("/register", async (req, res) => {
  try {
    const { name, email, phone, password, country } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: "Name, email, phone and password are all required." });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const user = new User({ name, email, phone, country: country || "LK", emailVerified: false });
    await user.setPassword(password);

    const otp = genOtp();
    await user.setVerifyOtp(otp);
    await user.save();

    try {
      await sendVerificationOtp(user.email, otp);
    } catch (mailErr) {
      console.error("Failed to send verification email:", mailErr.message);
      return res.status(500).json({ error: "Account created, but the verification email could not be sent. Try 'Resend code'." });
    }

    res.status(201).json({ needsVerification: true, email: user.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create account. Try again." });
  }
});

// POST /api/auth/verify-email  { email, otp }
router.post("/verify-email", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: "Email and code are required." });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(400).json({ error: "Invalid or expired code." });

    if (user.emailVerified) {
      const token = signToken(user);
      return res.json({ token, user: user.toSafeObject() });
    }

    if (!user.checkVerifyOtp(otp)) {
      return res.status(400).json({ error: "Invalid or expired code." });
    }

    user.emailVerified = true;
    user.clearVerifyOtp();
    await user.save();

    const token = signToken(user);
    res.json({ token, user: user.toSafeObject() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not verify email. Try again." });
  }
});

// POST /api/auth/resend-verification  { email }
// Always responds with a generic success message so this can't be used to
// probe which emails have accounts.
router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !validator.isEmail(email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (user && !user.emailVerified) {
      const otp = genOtp();
      await user.setVerifyOtp(otp);
      await user.save();
      try {
        await sendVerificationOtp(user.email, otp);
      } catch (mailErr) {
        console.error("Failed to resend verification email:", mailErr.message);
        return res.status(500).json({ error: "Could not send the code. Try again shortly." });
      }
    }

    res.json({ message: "If that account needs verifying, a new code has been sent." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not process request. Try again." });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await user.checkPassword(password))) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }

    if (!user.emailVerified) {
      return res.status(403).json({ error: "Please verify your email first.", needsVerification: true, email: user.email });
    }

    const token = signToken(user);
    res.json({ token, user: user.toSafeObject() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed. Try again." });
  }
});

// POST /api/auth/forgot-password
// Always responds with a generic success message (even if the email doesn't
// exist) so people can't use this endpoint to find out who has an account.
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !validator.isEmail(email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      const otp = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
      await user.setResetOtp(otp);
      await user.save();
      try {
        await sendPasswordResetOtp(user.email, otp);
      } catch (mailErr) {
        console.error("Failed to send OTP email:", mailErr.message);
        return res.status(500).json({ error: "Could not send the reset email. Try again shortly." });
      }
    }

    res.json({ message: "If an account exists for that email, a reset code has been sent." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not process request. Try again." });
  }
});

// POST /api/auth/reset-password
router.post("/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: "Email, code and new password are all required." });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await user.checkResetOtp(otp))) {
      return res.status(400).json({ error: "Invalid or expired code." });
    }

    await user.setPassword(newPassword);
    user.clearResetOtp();
    await user.save();

    res.json({ message: "Password updated. You can now log in." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not reset password. Try again." });
  }
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req, res) => {
  res.json({ user: req.user.toSafeObject() });
});

// PUT /api/auth/me  (edit name / phone / country from the Account page)
router.put("/me", requireAuth, async (req, res) => {
  try {
    const { name, phone, country } = req.body;

    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: "Name can't be empty." });
      req.user.name = name.trim();
    }
    if (phone !== undefined) {
      if (!phone.trim()) return res.status(400).json({ error: "Phone can't be empty." });
      req.user.phone = phone.trim();
    }
    if (country !== undefined) {
      req.user.country = country;
    }

    await req.user.save();
    res.json({ user: req.user.toSafeObject() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update account. Try again." });
  }
});

// PUT /api/auth/change-password  { currentPassword, newPassword }
router.put("/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new password are required." });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters." });
    }
    if (!(await req.user.checkPassword(currentPassword))) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }

    await req.user.setPassword(newPassword);
    await req.user.save();
    res.json({ message: "Password updated." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update password. Try again." });
  }
});

module.exports = router;
