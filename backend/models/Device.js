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

    // Snapshot of what was charged — left optional for now, payment is being
    // wired up later. Nothing below depends on this being filled in.
    pricing: {
      amountLKR: { type: Number },
      amountCharged: { type: Number },
      currency: { type: String },
      country: { type: String },
    },

    // The unique subdomain that makes ad-blocking actually work for this
    // device, e.g. token "a7x92k" -> link "a7x92k.yourdomain.eu.org".
    // Auto-generated the moment the device is created — no payment gate.
    token: { type: String, unique: true, sparse: true, index: true },
    link: { type: String },

    status: {
      type: String,
      enum: ["pending", "connected", "disconnected"],
      default: "pending",
    },

    // Filled in automatically once the device's Private DNS traffic is
    // actually seen by the proxy server — this is real, not simulated.
    network: {
      ip: { type: String, default: null }, // the IP the device first/last connected from
      firstConnectedAt: { type: Date, default: null },
      lastSeenAt: { type: Date, default: null },
      reverseDns: { type: String, default: null }, // PTR lookup on the IP, if any (hints at ISP/network)
      // Once a device has connected once, we "pair" it to that IP so a
      // stolen/shared link is easier to notice. This is a soft signal, not
      // a hard lock — mobile IPs change often when carriers reassign them,
      // so we don't block reconnects from a new IP, we just flag it.
      pairedIp: { type: String, default: null },
      ipChanged: { type: Boolean, default: false },
    },

    dnsProfile: {
      configured: { type: Boolean, default: false },
      configuredAt: { type: Date },
      note: { type: String, trim: true }, // internal note from support
    },

    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
  },
  { timestamps: true }
);

deviceSchema.index({ owner: 1, imei: 1 }, { unique: true });

module.exports = mongoose.model("Device", deviceSchema);
