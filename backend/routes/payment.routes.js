const express = require("express");
const Order = require("../models/Order");
const Device = require("../models/Device");
const { requireAuth } = require("../middleware/auth");
const { generateHash, getCheckoutUrl, verifyNotifySignature } = require("../utils/payhere");

const router = express.Router();

function newOrderRef() {
  return "PDA-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

// POST /api/payments/payhere/init  { deviceId }
// Creates an Order for the device and returns everything the frontend needs
// to hand off to the PayHere checkout form/SDK.
router.post("/payhere/init", requireAuth, async (req, res) => {
  try {
    const { deviceId } = req.body;
    const device = await Device.findOne({ _id: deviceId, owner: req.user._id });
    if (!device) return res.status(404).json({ error: "Device not found." });
    if (device.pricing.currency !== "LKR") {
      return res.status(400).json({ error: "This device's price is in a foreign currency — use the card checkout instead of PayHere." });
    }

    const orderRef = newOrderRef();
    const amount = device.pricing.amountCharged;
    const currency = device.pricing.currency;

    const { merchantId, amountFormatted, hash } = generateHash({ orderId: orderRef, amount, currency });

    const order = await Order.create({
      owner: req.user._id,
      device: device._id,
      orderRef,
      amountLKR: device.pricing.amountLKR,
      amountCharged: amount,
      currency,
      country: device.pricing.country,
      exchangeRate: device.pricing.amountLKR ? amount / device.pricing.amountLKR : 1,
      gateway: "payhere",
      status: "created",
    });

    res.json({
      checkoutUrl: getCheckoutUrl(),
      payload: {
        merchant_id: merchantId,
        order_id: orderRef,
        amount: amountFormatted,
        currency,
        hash,
        items: `Private DNS AdGuard - Device setup (${device.brand})`,
        first_name: req.user.name.split(" ")[0] || req.user.name,
        last_name: req.user.name.split(" ").slice(1).join(" ") || "-",
        email: req.user.email,
        phone: req.user.phone,
        return_url: `${process.env.FRONTEND_URL}/payment-success.html?order=${orderRef}`,
        cancel_url: `${process.env.FRONTEND_URL}/payment-cancelled.html?order=${orderRef}`,
        notify_url: `${req.protocol}://${req.get("host")}/api/payments/payhere/notify`,
      },
      orderId: order._id,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not start payment. Try again." });
  }
});

// POST /api/payments/payhere/notify
// PayHere calls this server-to-server once payment completes. Must respond 200.
// This is where a device actually gets marked paid — never trust the browser return_url alone.
router.post("/payhere/notify", express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const body = req.body;
    const isValid = verifyNotifySignature(body);

    if (!isValid) {
      console.warn("PayHere notify: signature mismatch, ignoring", body.order_id);
      return res.status(400).send("Invalid signature");
    }

    const order = await Order.findOne({ orderRef: body.order_id });
    if (!order) return res.status(404).send("Order not found");

    // status_code: 2 = success, 0 = pending, -1 = cancelled, -2 = failed, -3 = chargedback
    if (body.status_code === "2") {
      order.status = "paid";
      order.gatewayReference = body.payment_id;
      await order.save();
      // Note: the device's link/connection status is independent of payment
      // now — it was already generated when the device was created, and its
      // pending/connected/disconnected status is driven purely by real DNS
      // traffic (see utils/deviceStatus.js). Nothing to update here.
    } else if (["-1", "-2", "-3"].includes(body.status_code)) {
      order.status = body.status_code === "-1" ? "cancelled" : "failed";
      await order.save();
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing notification");
  }
});

// POST /api/payments/test-activate  { deviceId, code }
// Password-gated action used right after a device is created, to reveal
// its Private DNS link (Copy + OK in the UI). The link itself was already
// auto-generated at creation time — this step exists purely as a
// confirmation gate before showing/copying it, using the same password
// prompt this project already had. Gated behind TEST_ACTIVATE_CODE in
// .env; if that's not set, this route refuses to do anything.
router.post("/test-activate", requireAuth, async (req, res) => {
  try {
    const configuredCode = process.env.TEST_ACTIVATE_CODE;
    if (!configuredCode) {
      return res.status(400).json({ error: "Confirmation code is not enabled on this server." });
    }

    const { deviceId, code } = req.body;
    if (!code || code !== configuredCode) {
      return res.status(401).json({ error: "Invalid password." });
    }

    const device = await Device.findOne({ _id: deviceId, owner: req.user._id });
    if (!device) return res.status(404).json({ error: "Device not found." });
    if (!device.link) return res.status(400).json({ error: "This device has no link yet." });

    res.json({ ok: true, link: device.link });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not confirm. Try again." });
  }
});

// GET /api/payments/order/:orderRef  (used by the success page to show status)
router.get("/order/:orderRef", requireAuth, async (req, res) => {
  const order = await Order.findOne({ orderRef: req.params.orderRef, owner: req.user._id });
  if (!order) return res.status(404).json({ error: "Order not found." });
  res.json({ order });
});

/*
 * Foreign-currency card payments (USD/EUR/GBP/etc.):
 * PayHere's standard merchant account settles in LKR, so for customers outside
 * Sri Lanka the cleanest path is Stripe Checkout. Wire it up the same way:
 *   1. npm install stripe
 *   2. Create a Checkout Session server-side with device.pricing.amountCharged
 *      and device.pricing.currency
 *   3. Redirect the customer to session.url
 *   4. Verify the "checkout.session.completed" webhook (like payhere/notify above)
 *      before marking the device pending_setup
 * Left as a stub here since it needs your own Stripe account keys in .env.
 */

module.exports = router;
