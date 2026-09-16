const crypto = require("crypto");

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o/1/l/i ambiguity

function randomToken(length = 6) {
  let out = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/**
 * Builds a unique subdomain for a device, e.g.
 *   buildDeviceLink("nmdandds.eu.org") -> { token: "a7x92k", link: "a7x92k.nmdandds.eu.org" }
 */
function buildDeviceLink(baseDomain) {
  const token = randomToken(6);
  const link = `${token}.${baseDomain}`;
  return { token, link };
}

module.exports = { buildDeviceLink, randomToken };
