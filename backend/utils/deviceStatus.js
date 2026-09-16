// A device's real status is derived from whether the proxy server has seen
// its Private DNS traffic recently — there's no fake countdown anymore
// (the earlier version simulated a 2-3 minute "connecting" wait; now the
// device is either genuinely sending DNS queries through its link or not).

const DISCONNECT_AFTER_MINUTES = Number(process.env.DISCONNECT_AFTER_MINUTES || 3);

/**
 * Computes the current display status for a device without needing a
 * background job — cheap enough to run on every read.
 *   - "pending"      : link generated, never seen a connection yet
 *   - "connected"    : a heartbeat arrived within the last N minutes
 *   - "disconnected" : has connected before, but gone quiet
 */
function resolveDeviceStatus(device) {
  if (!device.network?.firstConnectedAt) {
    device.status = "pending";
    return device;
  }

  const lastSeen = device.network.lastSeenAt;
  const ageMs = lastSeen ? Date.now() - new Date(lastSeen).getTime() : Infinity;

  device.status = ageMs <= DISCONNECT_AFTER_MINUTES * 60 * 1000 ? "connected" : "disconnected";
  return device;
}

function resolveDeviceStatuses(devices) {
  return devices.map(resolveDeviceStatus);
}

module.exports = { resolveDeviceStatus, resolveDeviceStatuses, DISCONNECT_AFTER_MINUTES };
