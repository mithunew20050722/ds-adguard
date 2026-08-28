const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

let state = {
  user: null,
  devices: [],
  brands: [],
  countries: [],
  wizard: { step: 1, protection: { appAds: true, backgroundAds: true }, country: "LK", price: null, imei: "", brand: "" },
};

function showToast(message, type = "success") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* ---------------- Auth screen ---------------- */

function showAuthForm(name) {
  const forms = { login: "#login-form", register: "#register-form", forgot: "#forgot-form", reset: "#reset-form", verify: "#verify-form" };
  Object.entries(forms).forEach(([key, sel]) => $(sel).classList.toggle("hidden", key !== name));
  $$(".auth-tab").forEach((t) => t.classList.remove("active"));
  if (name === "login" || name === "register") {
    const tab = $$(".auth-tab").find((t) => t.dataset.mode === name);
    if (tab) tab.classList.add("active");
  }
  $("#auth-bottom-note").classList.toggle("hidden", name !== "login" && name !== "register");
}

function goToVerify(email) {
  $("#verify-email-label").textContent = email;
  $("#verify-otp").value = "";
  $("#verify-error").classList.add("hidden");
  $("#verify-info").classList.add("hidden");
  showAuthForm("verify");
}

function initAuthScreen() {
  $$(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => showAuthForm(tab.dataset.mode));
  });

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errBox = $("#login-error");
    errBox.classList.add("hidden");
    try {
      const { token, user } = await Api.login({
        email: $("#login-email").value.trim(),
        password: $("#login-password").value,
      });
      Api.setToken(token);
      state.user = user;
      enterApp();
    } catch (err) {
      if (err.needsVerification) {
        goToVerify(err.email || $("#login-email").value.trim());
        return;
      }
      errBox.textContent = err.message;
      errBox.classList.remove("hidden");
    }
  });

  $("#register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errBox = $("#register-error");
    errBox.classList.add("hidden");
    try {
      const result = await Api.register({
        name: $("#reg-name").value.trim(),
        email: $("#reg-email").value.trim(),
        phone: $("#reg-phone").value.trim(),
        password: $("#reg-password").value,
        country: $("#reg-country").value,
      });
      goToVerify(result.email);
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove("hidden");
    }
  });

  $("#verify-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errBox = $("#verify-error");
    errBox.classList.add("hidden");
    try {
      const { token, user } = await Api.verifyEmail({
        email: $("#verify-email-label").textContent,
        otp: $("#verify-otp").value.trim(),
      });
      Api.setToken(token);
      state.user = user;
      enterApp();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove("hidden");
    }
  });

  $("#resend-verification").addEventListener("click", async (e) => {
    e.preventDefault();
    const infoBox = $("#verify-info");
    const errBox = $("#verify-error");
    errBox.classList.add("hidden");
    try {
      const { message } = await Api.resendVerification($("#verify-email-label").textContent);
      infoBox.textContent = message;
      infoBox.classList.remove("hidden");
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove("hidden");
    }
  });

  $("#show-login-from-verify").addEventListener("click", (e) => {
    e.preventDefault();
    showAuthForm("login");
  });

  $("#show-forgot").addEventListener("click", (e) => {
    e.preventDefault();
    showAuthForm("forgot");
  });
  $("#show-login-from-forgot").addEventListener("click", (e) => {
    e.preventDefault();
    showAuthForm("login");
  });
  $("#show-login-from-reset").addEventListener("click", (e) => {
    e.preventDefault();
    showAuthForm("login");
  });

  $("#forgot-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errBox = $("#forgot-error");
    const infoBox = $("#forgot-info");
    errBox.classList.add("hidden");
    infoBox.classList.add("hidden");
    const email = $("#forgot-email").value.trim();
    try {
      const { message } = await Api.forgotPassword(email);
      infoBox.textContent = message;
      infoBox.classList.remove("hidden");
      $("#reset-email").value = email;
      showAuthForm("reset");
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove("hidden");
    }
  });

  $("#reset-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errBox = $("#reset-error");
    errBox.classList.add("hidden");
    try {
      await Api.resetPassword({
        email: $("#reset-email").value.trim(),
        otp: $("#reset-otp").value.trim(),
        newPassword: $("#reset-password").value,
      });
      showToast("Password updated. Log in with your new password.");
      showAuthForm("login");
      $("#login-email").value = $("#reset-email").value;
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove("hidden");
    }
  });
}

/* ---------------- App shell / nav ---------------- */

function initNav() {
  $$(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".nav-item").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      $$(".view").forEach((v) => v.classList.add("hidden"));
      $(`#view-${btn.dataset.view}`).classList.remove("hidden");
    });
  });

  function doLogout() {
    Api.setToken(null);
    state.user = null;
    location.reload();
  }
  $("#logout-btn").addEventListener("click", doLogout);
  $("#acct-logout-btn").addEventListener("click", doLogout);
}

function fillAccountView() {
  $("#acct-name").value = state.user.name;
  $("#acct-email").textContent = state.user.email;
  $("#acct-phone").value = state.user.phone;
  $("#acct-country").value = state.user.country || "LK";
}

function initAccountForms() {
  $("#acct-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errBox = $("#acct-error");
    errBox.classList.add("hidden");
    try {
      const { user } = await Api.updateProfile({
        name: $("#acct-name").value.trim(),
        phone: $("#acct-phone").value.trim(),
        country: $("#acct-country").value,
      });
      state.user = user;
      $("#sidebar-name").textContent = user.name;
      showToast("Account details updated.");
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove("hidden");
    }
  });

  $("#change-pw-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errBox = $("#pw-error");
    errBox.classList.add("hidden");
    try {
      await Api.changePassword({
        currentPassword: $("#pw-current").value,
        newPassword: $("#pw-new").value,
      });
      $("#pw-current").value = "";
      $("#pw-new").value = "";
      showToast("Password updated.");
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove("hidden");
    }
  });
}

async function enterApp() {
  $("#auth-shell").classList.add("hidden");
  $("#app-shell").classList.remove("hidden");
  $("#sidebar-name").textContent = state.user.name;
  $("#sidebar-email").textContent = state.user.email;
  fillAccountView();

  const [{ brands }, { countries }] = await Promise.all([Api.brands(), Api.countries()]);
  state.brands = brands;
  state.countries = countries;
  populateBrandSelect();
  populateCountrySelect();

  await refreshDevices();
}

/* ---------------- Devices list ---------------- */

async function refreshDevices() {
  const { devices } = await Api.listDevices();
  state.devices = devices;
  renderDevices();
  manageConnectingWatchers();
}

/* ---- "Connecting" live countdown + auto-refresh until it flips to active ---- */

let countdownTicker = null;
let statusPoller = null;

function manageConnectingWatchers() {
  const hasConnecting = state.devices.some((d) => d.status === "connecting");

  if (!countdownTicker) {
    countdownTicker = setInterval(tickCountdowns, 1000);
  }

  if (hasConnecting && !statusPoller) {
    // Ask the server every 10s — it lazily flips connecting -> active once the window passes
    statusPoller = setInterval(refreshDevices, 10000);
  } else if (!hasConnecting && statusPoller) {
    clearInterval(statusPoller);
    statusPoller = null;
  }
}

function tickCountdowns() {
  $$(".connect-countdown").forEach((el) => {
    const until = new Date(el.dataset.countdown).getTime();
    const remainingMs = until - Date.now();
    const span = el.querySelector("span");

    if (remainingMs <= 0) {
      span.textContent = "00:00";
      return;
    }
    const totalSec = Math.floor(remainingMs / 1000);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const ss = String(totalSec % 60).padStart(2, "0");
    span.textContent = `${mm}:${ss}`;
  });
}

function renderDevices() {
  const grid = $("#device-grid");
  const empty = $("#device-empty");

  if (!state.devices.length) {
    grid.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }
  grid.classList.remove("hidden");
  empty.classList.add("hidden");

  grid.innerHTML = state.devices.map(deviceCardHtml).join("");

  $$(".device-remove", grid).forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Remove this device from your account?")) return;
      await Api.removeDevice(btn.dataset.id);
      showToast("Device removed.");
      refreshDevices();
    });
  });

  $$(".device-pay", grid).forEach((btn) => {
    btn.addEventListener("click", () => payForDevice(btn.dataset.id));
  });
}

const STATUS_LABEL = {
  active: "Connected",
  connecting: "Connecting",
  pending_payment: "Payment pending",
  failed: "Payment failed",
  expired: "Expired",
};

function deviceCardHtml(d) {
  const tags = [];
  if (d.protection.appAds) tags.push("In-app ads");
  if (d.protection.backgroundAds) tags.push("Background ads");

  const payButton =
    d.status === "pending_payment"
      ? `<button class="btn btn-primary device-pay" data-id="${d._id}" style="padding:7px 14px;font-size:12.5px;">Pay now</button>`
      : "";

  const countdown =
    d.status === "connecting" && d.connectingUntil
      ? `<div class="connect-countdown" data-countdown="${d.connectingUntil}">Connecting… <span class="mono">--:--</span></div>`
      : "";

  return `
    <div class="device-card" data-device-id="${d._id}">
      <div class="device-card-top">
        <div>
          <div class="device-brand">${escapeHtml(d.brand)}</div>
          <div class="device-imei mono">IMEI ${escapeHtml(d.imei)}</div>
          ${countdown}
        </div>
        <span class="status-pill status-${d.status}">${STATUS_LABEL[d.status] || d.status}</span>
      </div>
      <div class="protection-tags">
        ${tags.map((t) => `<span class="tag">${t}</span>`).join("")}
      </div>
      <div class="device-card-footer">
        <span class="device-price">${d.pricing.currency} ${Number(d.pricing.amountCharged).toFixed(2)}</span>
        <div style="display:flex; gap:8px;">
          ${payButton}
          <button class="btn btn-ghost device-remove" data-id="${d._id}" style="padding:7px 12px;font-size:12.5px;">Remove</button>
        </div>
      </div>
    </div>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------------- Add device wizard ---------------- */

function populateBrandSelect() {
  const sel = $("#wizard-brand");
  sel.innerHTML = state.brands.map((b) => `<option value="${b}">${b === "OTHER" ? "OTHER (type below)" : b}</option>`).join("");
}

function populateCountrySelect() {
  const sel = $("#wizard-country");
  sel.innerHTML = state.countries.map((c) => `<option value="${c.code}">${c.code} — ${c.currency}</option>`).join("");
  sel.value = state.user?.country || "LK";
}

function openWizard() {
  state.wizard = { step: 1, protection: { appAds: true, backgroundAds: true }, country: state.user?.country || "LK", price: null, imei: "", brand: state.brands[0] || "" };
  $("#wizard-overlay").classList.remove("hidden");
  syncWizardCheckboxes();
  renderWizardStep();
}

function closeWizard() {
  $("#wizard-overlay").classList.add("hidden");
}

function syncWizardCheckboxes() {
  $("#opt-app-ads").checked = state.wizard.protection.appAds;
  $("#opt-bg-ads").checked = state.wizard.protection.backgroundAds;
  $("#opt-app-ads").closest(".check-option").classList.toggle("checked", state.wizard.protection.appAds);
  $("#opt-bg-ads").closest(".check-option").classList.toggle("checked", state.wizard.protection.backgroundAds);
}

function renderWizardStep() {
  $$(".wizard-step-dot").forEach((dot, i) => {
    dot.classList.toggle("current", i + 1 === state.wizard.step);
    dot.classList.toggle("done", i + 1 < state.wizard.step);
  });
  $$(".wizard-pane").forEach((p) => p.classList.add("hidden"));
  $(`#wizard-step-${state.wizard.step}`).classList.remove("hidden");

  $("#wizard-back").classList.toggle("hidden", state.wizard.step === 1);
  $("#wizard-next").textContent = state.wizard.step === 3 ? "Review & pay" : "Continue";
}

async function refreshWizardPrice() {
  const country = $("#wizard-country").value;
  state.wizard.country = country;
  const priceBox = $("#wizard-price");
  priceBox.innerHTML = `<span class="label">Calculating...</span>`;
  try {
    const price = await Api.price(country);
    state.wizard.price = price;
    priceBox.innerHTML = `
      <div>
        <div class="label">Setup cost — 1 device</div>
        <div class="amount">${price.amountDisplay}</div>
      </div>
      <div class="label mono">${price.currency}</div>`;
  } catch (err) {
    priceBox.innerHTML = `<span class="label">Couldn't load price. Check your connection.</span>`;
  }
}

function initWizard() {
  $("#add-device-btn").addEventListener("click", openWizard);
  $("#wizard-close").addEventListener("click", closeWizard);

  $$(".check-option input").forEach((box) => {
    box.addEventListener("change", () => {
      state.wizard.protection.appAds = $("#opt-app-ads").checked;
      state.wizard.protection.backgroundAds = $("#opt-bg-ads").checked;
      syncWizardCheckboxes();
    });
  });

  $("#wizard-country").addEventListener("change", refreshWizardPrice);

  $("#wizard-brand").addEventListener("change", () => {
    $("#wizard-brand-custom").classList.toggle("hidden", $("#wizard-brand").value !== "OTHER");
  });

  $("#wizard-back").addEventListener("click", () => {
    state.wizard.step = Math.max(1, state.wizard.step - 1);
    renderWizardStep();
  });

  $("#wizard-next").addEventListener("click", async () => {
    if (state.wizard.step === 1) {
      if (!state.wizard.protection.appAds && !state.wizard.protection.backgroundAds) {
        showToast("Select at least one protection type.", "error");
        return;
      }
      state.wizard.step = 2;
      renderWizardStep();
      refreshWizardPrice();
      return;
    }

    if (state.wizard.step === 2) {
      if (!state.wizard.price) {
        showToast("Wait for the price to load.", "error");
        return;
      }
      state.wizard.step = 3;
      renderWizardStep();
      return;
    }

    if (state.wizard.step === 3) {
      const imei = $("#wizard-imei").value.trim();
      if (!/^\d{14,17}$/.test(imei)) {
        showToast("Enter a valid IMEI (14-17 digits).", "error");
        return;
      }
      let brand = $("#wizard-brand").value;
      if (brand === "OTHER") {
        brand = $("#wizard-brand-custom").value.trim().toUpperCase();
        if (!brand) {
          showToast("Type the phone brand.", "error");
          return;
        }
      }
      state.wizard.imei = imei;
      state.wizard.brand = brand;
      await submitDevice();
    }
  });
}

async function submitDevice() {
  const btn = $("#wizard-next");
  btn.disabled = true;
  try {
    const { device } = await Api.addDevice({
      imei: state.wizard.imei,
      brand: state.wizard.brand,
      protection: state.wizard.protection,
      country: state.wizard.country,
    });
    closeWizard();
    showToast("Device saved. Complete payment to start setup.");
    await refreshDevices();
    if (device.pricing.currency === "LKR") {
      payForDevice(device._id);
    } else {
      showToast("Card checkout for non-LKR pricing needs a Stripe account set up by the site owner.", "error");
    }
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

/* ---------------- Pay now (shop-internal: password gated, no real gateway) ---------------- */

async function payForDevice(deviceId) {
  const code = prompt("Enter password to confirm payment:");
  if (code === null) return; // cancelled
  try {
    await Api.testActivate(deviceId, code);
    showToast("Payment confirmed. Setting up device...");
    await refreshDevices();
  } catch (err) {
    showToast(err.message, "error");
  }
}

/* ---------------- Boot ---------------- */

async function boot() {
  initAuthScreen();
  initNav();
  initWizard();
  initAccountForms();

  if (Api.token) {
    try {
      const { user } = await Api.me();
      state.user = user;
      await enterApp();
      return;
    } catch (_) {
      Api.setToken(null);
    }
  }
  $("#auth-shell").classList.remove("hidden");
}

document.addEventListener("DOMContentLoaded", boot);
