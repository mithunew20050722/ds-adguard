const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const API_BASE = window.API_BASE || "/api";

const AdminApi = {
  token: localStorage.getItem("pda_admin_token") || null,

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem("pda_admin_token", token);
    else localStorage.removeItem("pda_admin_token");
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
      throw new Error(data.error || "Something went wrong. Try again.");
    }
    return data;
  },

  login(password) { return this.request("/admin/login", { method: "POST", body: { password } }); },

  listUsers() { return this.request("/admin/users"); },
  getUser(id) { return this.request(`/admin/users/${id}`); },
  updateUser(id, payload) { return this.request(`/admin/users/${id}`, { method: "PUT", body: payload }); },
  deleteUser(id) { return this.request(`/admin/users/${id}`, { method: "DELETE" }); },

  updateDevice(id, payload) { return this.request(`/admin/devices/${id}`, { method: "PUT", body: payload }); },
  deleteDevice(id) { return this.request(`/admin/devices/${id}`, { method: "DELETE" }); },
};

let state = { users: [], filtered: [], activeUserId: null };

function showToast(message, type = "success") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/* ---------------- Login ---------------- */

function initAdminAuth() {
  $("#admin-login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errBox = $("#admin-login-error");
    errBox.classList.add("hidden");
    try {
      const { token } = await AdminApi.login($("#admin-login-password").value);
      AdminApi.setToken(token);
      await enterAdminApp();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove("hidden");
    }
  });

  $("#admin-logout-btn").addEventListener("click", () => {
    AdminApi.setToken(null);
    location.reload();
  });
}

async function enterAdminApp() {
  $("#admin-auth-shell").classList.add("hidden");
  $("#admin-app-shell").classList.remove("hidden");
  await loadUsers();
}

/* ---------------- Users table ---------------- */

async function loadUsers() {
  const { users } = await AdminApi.listUsers();
  state.users = users;
  applyUserFilter();
}

function applyUserFilter() {
  const q = $("#user-search").value.trim().toLowerCase();
  state.filtered = !q
    ? state.users
    : state.users.filter((u) =>
        [u.name, u.email, u.phone].some((f) => (f || "").toLowerCase().includes(q))
      );
  renderUserTable();
}

function renderUserTable() {
  const body = $("#user-table-body");
  const empty = $("#user-empty");

  if (!state.filtered.length) {
    body.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  body.innerHTML = state.filtered.map((u) => `
    <tr class="clickable" data-id="${u.id}">
      <td>${escapeHtml(u.name)}</td>
      <td class="mono">${escapeHtml(u.email)}</td>
      <td class="mono">${escapeHtml(u.phone)}</td>
      <td>${escapeHtml(u.country || "—")}</td>
      <td><span class="badge ${u.emailVerified ? "badge-yes" : "badge-no"}">${u.emailVerified ? "Yes" : "No"}</span></td>
      <td><span class="badge ${u.role === "admin" ? "badge-admin" : "badge-customer"}">${u.role}</span></td>
      <td>${u.deviceCount}</td>
      <td class="mono">${formatDate(u.createdAt)}</td>
    </tr>
  `).join("");

  $$("tr.clickable", body).forEach((row) => {
    row.addEventListener("click", () => openUserPanel(row.dataset.id));
  });
}

/* ---------------- User detail side panel ---------------- */

const DEVICE_STATUSES = ["pending_payment", "connecting", "active", "failed", "expired"];
const STATUS_LABEL = {
  active: "Connected", connecting: "Connecting", pending_payment: "Payment pending",
  failed: "Payment failed", expired: "Expired",
};

async function openUserPanel(userId) {
  state.activeUserId = userId;
  $("#sp-error").classList.add("hidden");
  const { user, devices } = await AdminApi.getUser(userId);
  fillUserPanel(user, devices);
  $("#user-panel-overlay").classList.remove("hidden");
}

function closeUserPanel() {
  $("#user-panel-overlay").classList.add("hidden");
  state.activeUserId = null;
}

function fillUserPanel(user, devices) {
  $("#sp-user-name").textContent = user.name;
  $("#sp-user-email").textContent = user.email;
  $("#sp-name").value = user.name;
  $("#sp-phone").value = user.phone;
  $("#sp-country").value = user.country || "LK";
  $("#sp-role").value = user.role;
  $("#sp-verified").checked = !!user.emailVerified;
  $("#sp-device-count").textContent = devices.length;

  const list = $("#sp-devices");
  const empty = $("#sp-devices-empty");
  if (!devices.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
  } else {
    empty.classList.add("hidden");
    list.innerHTML = devices.map((d) => `
      <div class="mini-device" data-device-id="${d._id}">
        <div class="mini-device-top">
          <div>
            <div style="font-weight:600; font-size:13px;">${escapeHtml(d.brand)}</div>
            <div class="mono muted" style="font-size:12px;">IMEI ${escapeHtml(d.imei)}</div>
          </div>
          <span class="status-pill status-${d.status}">${STATUS_LABEL[d.status] || d.status}</span>
        </div>
        <div class="field" style="margin-bottom:8px;">
          <select class="mini-device-status" style="width:100%;">
            ${DEVICE_STATUSES.map((s) => `<option value="${s}" ${s === d.status ? "selected" : ""}>${STATUS_LABEL[s]}</option>`).join("")}
          </select>
        </div>
        <div class="inline-row">
          <button class="btn btn-ghost mini-device-save" style="padding:6px 12px; font-size:12.5px;">Save status</button>
          <button class="btn btn-danger mini-device-delete" style="padding:6px 12px; font-size:12.5px;">Remove device</button>
        </div>
      </div>
    `).join("");
  }

  $$(".mini-device", list).forEach((card) => {
    const deviceId = card.dataset.deviceId;
    card.querySelector(".mini-device-save").addEventListener("click", async () => {
      try {
        const status = card.querySelector(".mini-device-status").value;
        await AdminApi.updateDevice(deviceId, { status });
        showToast("Device status updated.");
        await refreshPanelAndTable();
      } catch (err) {
        showToast(err.message, "error");
      }
    });
    card.querySelector(".mini-device-delete").addEventListener("click", async () => {
      if (!confirm("Remove this device from the user's account?")) return;
      try {
        await AdminApi.deleteDevice(deviceId);
        showToast("Device removed.");
        await refreshPanelAndTable();
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
}

async function refreshPanelAndTable() {
  if (state.activeUserId) {
    const { user, devices } = await AdminApi.getUser(state.activeUserId);
    fillUserPanel(user, devices);
  }
  await loadUsers();
}

function initUserPanel() {
  $("#user-panel-close").addEventListener("click", closeUserPanel);
  $("#user-panel-overlay").addEventListener("click", (e) => {
    if (e.target.id === "user-panel-overlay") closeUserPanel();
  });

  $("#sp-save-user").addEventListener("click", async () => {
    const errBox = $("#sp-error");
    errBox.classList.add("hidden");
    try {
      await AdminApi.updateUser(state.activeUserId, {
        name: $("#sp-name").value.trim(),
        phone: $("#sp-phone").value.trim(),
        country: $("#sp-country").value,
        role: $("#sp-role").value,
        emailVerified: $("#sp-verified").checked,
      });
      showToast("User updated.");
      await refreshPanelAndTable();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove("hidden");
    }
  });

  $("#sp-delete-user").addEventListener("click", async () => {
    if (!confirm("Delete this user and all their devices? This can't be undone.")) return;
    try {
      await AdminApi.deleteUser(state.activeUserId);
      showToast("User deleted.");
      closeUserPanel();
      await loadUsers();
    } catch (err) {
      showToast(err.message, "error");
    }
  });
}

/* ---------------- Boot ---------------- */

async function boot() {
  initAdminAuth();
  initUserPanel();
  $("#user-search").addEventListener("input", applyUserFilter);

  if (AdminApi.token) {
    try {
      await enterAdminApp(); // loadUsers() inside will throw if the token is invalid/expired
      return;
    } catch (_) {
      AdminApi.setToken(null);
      $("#admin-app-shell").classList.add("hidden");
    }
  }
  $("#admin-auth-shell").classList.remove("hidden");
}

document.addEventListener("DOMContentLoaded", boot);
