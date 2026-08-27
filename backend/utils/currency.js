const fetch = require("node-fetch");

// Country -> currency mapping for the countries the control panel offers.
// Add more rows here any time you want to support another country.
const COUNTRY_CURRENCY = {
  LK: { currency: "LKR", symbol: "Rs" },
  US: { currency: "USD", symbol: "$" },
  GB: { currency: "GBP", symbol: "£" },
  AU: { currency: "AUD", symbol: "A$" },
  CA: { currency: "CAD", symbol: "C$" },
  IN: { currency: "INR", symbol: "₹" },
  JP: { currency: "JPY", symbol: "¥" },
  CN: { currency: "CNY", symbol: "¥" },
  DE: { currency: "EUR", symbol: "€" },
  FR: { currency: "EUR", symbol: "€" },
  IT: { currency: "EUR", symbol: "€" },
  ES: { currency: "EUR", symbol: "€" },
  AE: { currency: "AED", symbol: "د.إ" },
  SG: { currency: "SGD", symbol: "S$" },
  QA: { currency: "QAR", symbol: "ر.ق" },
  SA: { currency: "SAR", symbol: "ر.س" },
  KR: { currency: "KRW", symbol: "₩" },
};

// Simple in-memory cache so we don't hit the exchange-rate API on every request.
let rateCache = { base: null, rates: null, fetchedAt: 0 };
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Fallback rates (approximate, LKR base) used only if the live API is unreachable,
// so pricing never breaks for the customer. Update occasionally if you rely on this path.
const FALLBACK_RATES_FROM_LKR = {
  LKR: 1,
  USD: 0.0034,
  GBP: 0.0027,
  AUD: 0.0052,
  CAD: 0.0047,
  INR: 0.29,
  JPY: 0.5,
  CNY: 0.024,
  EUR: 0.0031,
  AED: 0.0125,
  SGD: 0.0046,
  QAR: 0.0124,
  SAR: 0.0128,
  KRW: 4.6,
};

async function getRatesFromLKR() {
  const now = Date.now();
  if (rateCache.rates && now - rateCache.fetchedAt < CACHE_TTL_MS) {
    return rateCache.rates;
  }

  try {
    // Free, no-API-key exchange rate endpoint. Swap for a paid provider if you need
    // higher reliability/rate limits in production.
    const res = await fetch("https://open.er-api.com/v6/latest/LKR");
    const data = await res.json();

    if (data && data.result === "success" && data.rates) {
      rateCache = { base: "LKR", rates: data.rates, fetchedAt: now };
      return data.rates;
    }
    throw new Error("Unexpected exchange rate response");
  } catch (err) {
    console.warn("Live exchange rate fetch failed, using fallback rates:", err.message);
    return FALLBACK_RATES_FROM_LKR;
  }
}

/**
 * Given a country code and a base LKR amount, return the converted price,
 * the currency code, its display symbol, and the rate used (for order auditing).
 */
async function convertPrice(countryCode, amountLKR) {
  const country = (countryCode || "LK").toUpperCase();
  const mapping = COUNTRY_CURRENCY[country] || COUNTRY_CURRENCY.LK;

  if (mapping.currency === "LKR") {
    return {
      country,
      currency: "LKR",
      symbol: mapping.symbol,
      rate: 1,
      amount: amountLKR,
      amountDisplay: formatAmount(amountLKR, "LKR"),
    };
  }

  const rates = await getRatesFromLKR();
  const rate = rates[mapping.currency] || FALLBACK_RATES_FROM_LKR[mapping.currency] || 1;
  const amount = roundForCurrency(amountLKR * rate, mapping.currency);

  return {
    country,
    currency: mapping.currency,
    symbol: mapping.symbol,
    rate,
    amount,
    amountDisplay: formatAmount(amount, mapping.currency),
  };
}

function roundForCurrency(amount, currency) {
  // Zero-decimal currencies shouldn't show cents
  const zeroDecimal = ["JPY", "KRW"];
  return zeroDecimal.includes(currency) ? Math.round(amount) : Math.round(amount * 100) / 100;
}

function formatAmount(amount, currency) {
  const mapping = Object.values(COUNTRY_CURRENCY).find((c) => c.currency === currency);
  const symbol = mapping ? mapping.symbol : currency;
  const zeroDecimal = ["JPY", "KRW"];
  const formatted = zeroDecimal.includes(currency)
    ? amount.toLocaleString()
    : amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol} ${formatted}`;
}

module.exports = { COUNTRY_CURRENCY, convertPrice };
