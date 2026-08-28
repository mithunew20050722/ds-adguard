// Point this at your backend once it's deployed (e.g. https://api.yourdomain.com)
const API_BASE = window.API_BASE || "http://localhost:5000/api";

const Api = {
  token: localStorage.getItem("pda_token") || null,

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem("pda_token", token);
    else localStorage.removeItem("pda_token");
  },

  async request(path, { method = "GET", body } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    let data = {};
    try { data = await res.json(); } catch (_) {}

    if (!res.ok) {
      const err = new Error(data.error || "Something went wrong. Try again.");
      if (data.needsVerification) err.needsVerification = true;
      if (data.email) err.email = data.email;
      throw err;
    }
    return data;
  },

  register(payload) { return this.request("/auth/register", { method: "POST", body: payload }); },
  verifyEmail(payload) { return this.request("/auth/verify-email", { method: "POST", body: payload }); },
  resendVerification(email) { return this.request("/auth/resend-verification", { method: "POST", body: { email } }); },
  login(payload) { return this.request("/auth/login", { method: "POST", body: payload }); },
  me() { return this.request("/auth/me"); },
  updateProfile(payload) { return this.request("/auth/me", { method: "PUT", body: payload }); },
  changePassword(payload) { return this.request("/auth/change-password", { method: "PUT", body: payload }); },
  forgotPassword(email) { return this.request("/auth/forgot-password", { method: "POST", body: { email } }); },
  resetPassword(payload) { return this.request("/auth/reset-password", { method: "POST", body: payload }); },

  brands() { return this.request("/devices/brands"); },
  countries() { return this.request("/devices/countries"); },
  price(country) { return this.request(`/devices/price?country=${encodeURIComponent(country)}`); },

  listDevices() { return this.request("/devices"); },
  addDevice(payload) { return this.request("/devices", { method: "POST", body: payload }); },
  removeDevice(id) { return this.request(`/devices/${id}`, { method: "DELETE" }); },

  payhereInit(deviceId) { return this.request("/payments/payhere/init", { method: "POST", body: { deviceId } }); },
  testActivate(deviceId, code) { return this.request("/payments/test-activate", { method: "POST", body: { deviceId, code } }); },
};
