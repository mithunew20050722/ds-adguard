const MIN_CONNECT_MS = 2 * 60 * 1000; // 2 minutes
const MAX_CONNECT_MS = 3 * 60 * 1000; // 3 minutes

/** Call this the moment a device should start "connecting" (e.g. payment confirmed). */
function randomConnectingUntil() {
  const wait = MIN_CONNECT_MS + Math.random() * (MAX_CONNECT_MS - MIN_CONNECT_MS);
  return new Date(Date.now() + wait);
}

/**
 * Lazily flips a device from "connecting" to "active" once its window has
 * passed. No background job/cron needed — this runs cheaply on every read.
 * Mutates and (if changed) saves the device; returns the device either way.
 */
async function resolveDeviceStatus(device) {
  if (device.status === "connecting" && device.connectingUntil && Date.now() >= device.connectingUntil.getTime()) {
    device.status = "active";
    device.dnsProfile.configured = true;
    device.dnsProfile.configuredAt = new Date();
    await device.save();
  }
  return device;
}

async function resolveDeviceStatuses(devices) {
  return Promise.all(devices.map(resolveDeviceStatus));
}

module.exports = { randomConnectingUntil, resolveDeviceStatus, resolveDeviceStatuses };
