const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    country: { type: String, default: "LK" }, // ISO country code, used for currency detection
    role: { type: String, enum: ["customer", "admin"], default: "customer" },
    resetOtpHash: { type: String, default: null },
    resetOtpExpires: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function (plainPassword) {
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(plainPassword, salt);
};

userSchema.methods.setResetOtp = async function (otp) {
  const salt = await bcrypt.genSalt(10);
  this.resetOtpHash = await bcrypt.hash(otp, salt);
  this.resetOtpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
};

userSchema.methods.checkResetOtp = function (otp) {
  if (!this.resetOtpHash || !this.resetOtpExpires) return false;
  if (this.resetOtpExpires.getTime() < Date.now()) return false;
  return bcrypt.compare(otp, this.resetOtpHash);
};

userSchema.methods.clearResetOtp = function () {
  this.resetOtpHash = null;
  this.resetOtpExpires = null;
};

userSchema.methods.checkPassword = function (plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

userSchema.methods.toSafeObject = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    phone: this.phone,
    country: this.country,
    role: this.role,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model("User", userSchema);
