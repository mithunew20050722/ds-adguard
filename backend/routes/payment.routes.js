const express = require("express");
const Order = require("../models/Order");
const Device = require("../models/Device");
const { requireAuth } = require("../middleware/auth");
const { generateHash, getCheckoutUrl, verifyNotifySignature } = require("../utils/payhere");
const { randomConnectingUntil } = require("../utils/deviceStatus");

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

      // Move the device into the "connecting" window — it'll show a live
      // countdown on the frontend and flip itself to "active" once the
      // 2-3 minute window passes (see utils/deviceStatus.js).
      await Device.findByIdAndUpdate(order.device, {
        status: "connecting",
        connectingUntil: randomConnectingUntil(),
      });
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
// Admin/dev-only shortcut: skips the real payment gateway entirely and marks
// the device as paid, gated behind a password set in .env (TEST_ACTIVATE_CODE).
// Not linked from the normal "Pay now" button — only reachable from the
// separate admin/test UI. If TEST_ACTIVATE_CODE isn't set in .env, this
// route refuses to do anything (so it's inert in production unless you
// explicitly opt in).
router.post("/test-activate", requireAuth, async (req, res) => {
  try {
    const configuredCode = process.env.TEST_ACTIVATE_CODE;
    if (!configuredCode) {
      return res.status(400).json({ error: "Test activation is not enabled on this server." });
    }

    const { deviceId, code } = req.body;
    if (!code || code !== configuredCode) {
      return res.status(401).json({ error: "Invalid code." });
    }

    const device = await Device.findOne({ _id: deviceId, owner: req.user._id });
    if (!device) return res.status(404).json({ error: "Device not found." });

    const orderRef = newOrderRef();
    const order = await Order.create({
      owner: req.user._id,
      device: device._id,
      orderRef,
      amountLKR: device.pricing.amountLKR,
      amountCharged: device.pricing.amountCharged,
      currency: device.pricing.currency,
      country: device.pricing.country,
      exchangeRate: device.pricing.amountLKR ? device.pricing.amountCharged / device.pricing.amountLKR : 1,
      gateway: "test",
      status: "paid",
    });

    device.status = "connecting";
    device.connectingUntil = randomConnectingUntil();
    device.order = order._id;
    await device.save();

    res.json({ ok: true, order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not activate. Try again." });
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
