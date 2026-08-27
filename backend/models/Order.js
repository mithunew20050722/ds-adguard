const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    device: { type: mongoose.Schema.Types.ObjectId, ref: "Device" },

    orderRef: { type: String, required: true, unique: true }, // human-facing order id, e.g. PDA-000123

    amountLKR: { type: Number, required: true }, // canonical base amount
    amountCharged: { type: Number, required: true }, // amount in the customer's currency
    currency: { type: String, required: true },
    country: { type: String, required: true },
    exchangeRate: { type: Number, required: true }, // rate used at time of order, for auditing

    gateway: { type: String, enum: ["payhere", "stripe", "test"], required: true },
    gatewayReference: { type: String }, // payment_id from PayHere / payment_intent from Stripe

    status: {
      type: String,
      enum: ["created", "paid", "failed", "cancelled"],
      default: "created",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
