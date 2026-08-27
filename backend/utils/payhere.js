const crypto = require("crypto");

/**
 * PayHere Checkout API hash, per PayHere's official spec:
 * hash = UPPERCASE( MD5( merchant_id + order_id + amount(2dp) + currency + UPPERCASE(MD5(merchant_secret)) ) )
 * Docs: https://support.payhere.lk/api-&-mobile-sdk/checkout-api
 *
 * This must only ever run server-side — never expose merchant_secret to the browser.
 */
function generateHash({ orderId, amount, currency }) {
  const merchantId = process.env.PAYHERE_MERCHANT_ID;
  const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;

  if (!merchantId || !merchantSecret) {
    throw new Error("PAYHERE_MERCHANT_ID / PAYHERE_MERCHANT_SECRET not set in .env");
  }

  const amountFormatted = Number(amount).toFixed(2);
  const secretHash = crypto.createHash("md5").update(merchantSecret).digest("hex").toUpperCase();

  const hash = crypto
    .createHash("md5")
    .update(merchantId + orderId + amountFormatted + currency + secretHash)
    .digest("hex")
    .toUpperCase();

  return { merchantId, amountFormatted, hash };
}

function getCheckoutUrl() {
  return process.env.PAYHERE_MODE === "live"
    ? "https://www.payhere.lk/pay/checkout"
    : "https://sandbox.payhere.lk/pay/checkout";
}

/**
 * Verifies the md5sig sent by PayHere to your notify_url webhook, to confirm
 * the payment notification really came from PayHere before trusting it.
 */
function verifyNotifySignature({ merchant_id, order_id, payhere_amount, payhere_currency, status_code, md5sig }) {
  const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
  const secretHash = crypto.createHash("md5").update(merchantSecret).digest("hex").toUpperCase();

  const localSig = crypto
    .createHash("md5")
    .update(merchant_id + order_id + payhere_amount + payhere_currency + status_code + secretHash)
    .digest("hex")
    .toUpperCase();

  return localSig === md5sig;
}

module.exports = { generateHash, getCheckoutUrl, verifyNotifySignature };
