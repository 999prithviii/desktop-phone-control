const setupToken = new URL(location.href).searchParams.get("token") || "";
const setupState = document.querySelector("#setupState");
const qrCode = document.querySelector("#qrCode");
const qrStatus = document.querySelector("#qrStatus");
const phoneLink = document.querySelector("#phoneLink");
const copyLink = document.querySelector("#copyLink");
const regenerateQr = document.querySelector("#regenerateQr");
const manualCode = document.querySelector("#manualCode");
const setupHint = document.querySelector("#setupHint");
const senderLink = document.querySelector("#senderLink");
const openSender = document.querySelector("#openSender");
const copySender = document.querySelector("#copySender");

let currentInfo = null;
let countdownTimer = null;

async function setupApi(path, body = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: setupToken, ...body })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || `request failed (${response.status})`);
  return data;
}

function formatCountdown(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "expired";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}m ${String(rest).padStart(2, "0")}s` : `${rest}s`;
}

function setState(text, connected = false) {
  setupState.textContent = text;
  setupState.dataset.connected = connected ? "true" : "false";
}

function renderQr(url) {
  qrCode.innerHTML = "";
  if (!url) {
    qrCode.textContent = "Connected";
    return;
  }

  try {
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    qrCode.innerHTML = qr.createSvgTag(8, 4);
  } catch (error) {
    qrCode.textContent = "QR unavailable";
    qrStatus.textContent = "Copy the phone link instead";
  }
}

function updateCountdown() {
  if (!currentInfo || currentInfo.connection?.connected) return;
  const expiresAt = Number(currentInfo.pairTokenExpiresAt || 0);
  const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
  qrStatus.textContent = remaining > 0 ? `Single-use QR expires in ${formatCountdown(remaining)}` : "QR expired";
}

function renderInfo(info) {
  currentInfo = info;
  manualCode.value = info.pairCode || "";
  senderLink.value = info.senderUrl || "";
  openSender.disabled = !senderLink.value;
  copySender.disabled = !senderLink.value;

  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;

  if (info.connection?.connected) {
    setState("phone connected", true);
    phoneLink.value = "";
    copyLink.disabled = true;
    regenerateQr.disabled = true;
    renderQr("");
    qrStatus.textContent = "Disconnect on the phone or wait for timeout to pair a different device";
    setupHint.textContent = `Connected from ${info.connection.address || "phone"}.`;
    return;
  }

  if (info.connection?.inactiveTrusted) {
    setState("phone inactive", false);
    setupHint.textContent = `Previous phone can reopen the app to reconnect. Scan this QR to pair a different phone.`;
  } else {
    setState("ready", false);
    setupHint.textContent = "Scan once from your phone. The QR cannot be reused after pairing.";
  }
  phoneLink.value = info.pairTokenUrl || info.preferredPhoneUrl || "";
  copyLink.disabled = !phoneLink.value;
  regenerateQr.disabled = false;
  renderQr(phoneLink.value);
  updateCountdown();
  countdownTimer = setInterval(updateCountdown, 1000);
}

async function refreshInfo() {
  if (!setupToken) {
    setState("missing token");
    qrStatus.textContent = "Restart the app from the PC shortcut to open a private setup page";
    return;
  }

  try {
    renderInfo(await setupApi("/api/setup/info"));
  } catch (error) {
    setState("setup locked");
    qrStatus.textContent = error.message;
  }
}

copyLink.addEventListener("click", async () => {
  if (!phoneLink.value) return;
  try {
    await navigator.clipboard.writeText(phoneLink.value);
    qrStatus.textContent = "Phone link copied";
  } catch {
    phoneLink.select();
    qrStatus.textContent = "Select and copy the phone link";
  }
});

openSender.addEventListener("click", () => {
  if (!senderLink.value) return;
  window.open(senderLink.value, "_blank", "noopener,noreferrer");
});

copySender.addEventListener("click", async () => {
  if (!senderLink.value) return;
  try {
    await navigator.clipboard.writeText(senderLink.value);
    qrStatus.textContent = "Sender link copied";
  } catch {
    senderLink.select();
    qrStatus.textContent = "Select and copy the sender link";
  }
});

regenerateQr.addEventListener("click", async () => {
  regenerateQr.disabled = true;
  qrStatus.textContent = "Generating a new QR";
  try {
    const data = await setupApi("/api/setup/regenerate");
    renderInfo({ ...currentInfo, ...data, pairCode: currentInfo?.pairCode || "" });
  } catch (error) {
    qrStatus.textContent = error.message;
  } finally {
    regenerateQr.disabled = false;
  }
});

refreshInfo();
setInterval(refreshInfo, 5000);
