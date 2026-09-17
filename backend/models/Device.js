const mongoose = require("mongoose");

const deviceSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    imei: {
      type: String,
      required: true,
      trim: true,
      // IMEI is 15 digits, but some devices/dual-SIM report variants, so allow 14-17 digits
      match: [/^\d{14,17}$/, "IMEI must be 14-17 digits"],
    },

    brand: { type: String, required: true, trim: true, uppercase: true },

    // What the customer selected when adding the device
    protection: {
      appAds: { type: Boolean, default: true }, // block ads inside apps
      backgroundAds: { type: Boolean, default: true }, // block background/notification ads
    },

    // Snapshot of what was charged, so price history doesn't move if rates change later
    pricing: {
      amountLKR: { type: Number, required: true },
      amountCharged: { type: Number, required: true },
      currency: { type: String, required: true },
      country: { type: String, required: true },
    },

    status: {
      type: String,
      enum: ["pending_payment", "connecting", "active", "failed", "expired"],
      default: "pending_payment",
    },

    // When status is "connecting", this is the timestamp the device should
    // flip to "active" — gives the customer a realistic-looking setup wait
    // (2-3 minutes) instead of jumping straight from paid to protected.
    connectingUntil: { type: Date },

    dnsProfile: {
      configured: { type: Boolean, default: false },
      configuredAt: { type: Date },
      note: { type: String, trim: true }, // internal note from support, e.g. "profile installed remotely on 2026-08-27"
    },

    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
  },
  { timestamps: true }
);

deviceSchema.index({ owner: 1, imei: 1 }, { unique: true });

module.exports = mongoose.model("Device", deviceSchema);
