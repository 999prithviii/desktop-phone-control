const pairPanel = document.querySelector("#pairPanel");
const controlPanel = document.querySelector("#controlPanel");
const pairForm = document.querySelector("#pairForm");
const pairCode = document.querySelector("#pairCode");
const pairError = document.querySelector("#pairError");
const pad = document.querySelector("#pad");
const holdLeft = document.querySelector("#holdLeft");
const panic = document.querySelector("#panic");
const themeToggle = document.querySelector("#themeToggle");
const accentSelect = document.querySelector("#accentSelect");
const remoteStream = document.querySelector("#remoteStream");
const connectStream = document.querySelector("#connectStream");
const stopStream = document.querySelector("#stopStream");
const streamStatus = document.querySelector("#streamStatus");
const sensitivity = document.querySelector("#sensitivity");
const sensitivityValue = document.querySelector("#sensitivityValue");
const shortcutPanel = document.querySelector("#shortcutPanel");
const phoneShortcuts = document.querySelector("#phoneShortcuts");
const shortcutEditor = document.querySelector("#shortcutEditor");
const shortcutEditorStatus = document.querySelector("#shortcutEditorStatus");
const shortcutForm = document.querySelector("#shortcutForm");
const shortcutLabel = document.querySelector("#shortcutLabel");
const shortcutKey = document.querySelector("#shortcutKey");
const shortcutList = document.querySelector("#shortcutList");
const saveShortcuts = document.querySelector("#saveShortcuts");
const searchForm = document.querySelector("#searchForm");
const searchText = document.querySelector("#searchText");
const typeForm = document.querySelector("#typeForm");
const typeText = document.querySelector("#typeText");

let isPaired = false;
let activePointers = new Map();
let gesture = null;
let pendingDx = 0;
let pendingDy = 0;
let pendingScrollAmount = 0;
let moveFrame = 0;
let moveInFlight = false;
let scrollFrame = 0;
let scrollInFlight = false;
let leftHeld = false;
let autoDrag = false;
let longPressTimer = null;
let streamPeer = null;
let remoteMediaStream = null;
let shortcutPollTimer = null;
let editableShortcuts = [];
const adminToken = new URL(location.href).searchParams.get("admin") || "";

const DEFAULT_MOVE_SPEED = 2.6;
const SCROLL_SPEED = 12;
const TAP_MAX_MS = 280;
const TAP_MAX_DISTANCE = 14;
const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE_LIMIT = 10;

async function api(path, body = {}) {
  const response = await fetch(path, {
    method: path === "/api/status" ? "GET" : "POST",
    headers: path === "/api/status" ? {} : { "content-type": "application/json" },
    body: path === "/api/status" ? undefined : JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data;
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\+\+/g, "+")
    .replace(/^\+|\+$/g, "");
}

function createShortcutId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `shortcut-${Date.now()}-${Math.round(Math.random() * 10000)}`;
}

async function adminApi(path, body = {}) {
  return api(path, { token: adminToken, ...body });
}

function applyDisplaySettings() {
  const theme = localStorage.getItem("deskctl:theme") || "dark";
  const accentMap = {
    blue: "mint",
    emerald: "mint",
    rose: "coral",
    amber: "sun",
    violet: "pink"
  };
  const storedAccent = localStorage.getItem("deskctl:accent") || "mint";
  const accent = accentMap[storedAccent] || storedAccent;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.accent = accent;
  themeToggle.textContent = theme === "dark" ? "Dark" : "Light";
  accentSelect.value = accent;
  localStorage.setItem("deskctl:accent", accent);
}

function getMoveSpeed() {
  const value = Number(sensitivity.value);
  if (!Number.isFinite(value)) return DEFAULT_MOVE_SPEED;
  return Math.max(0.8, Math.min(5, value));
}

function updateSensitivityLabel() {
  const speed = getMoveSpeed();
  sensitivity.value = String(speed);
  sensitivityValue.textContent = `${speed.toFixed(1)}x`;
  localStorage.setItem("deskctl:sensitivity", String(speed));
}

function showControls() {
  isPaired = true;
  pairPanel.classList.add("hidden");
  controlPanel.classList.remove("hidden");
  void loadPhoneShortcuts();
  if (!shortcutPollTimer) {
    shortcutPollTimer = setInterval(() => {
      void loadPhoneShortcuts();
    }, 5000);
  }
  if (adminToken) {
    shortcutEditor.classList.remove("hidden");
    void loadEditableShortcuts();
  }
}

function renderPhoneShortcuts(shortcuts) {
  phoneShortcuts.innerHTML = "";
  shortcutPanel.classList.toggle("hidden", !shortcuts.length);

  for (const shortcut of shortcuts) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = shortcut.label;
    button.title = shortcut.key;
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await api("/api/shortcuts/run", { id: shortcut.id });
      } catch (error) {
        console.error(error);
      } finally {
        button.disabled = false;
      }
    });

    phoneShortcuts.append(button);
  }
}

async function loadPhoneShortcuts() {
  try {
    const data = await api("/api/shortcuts/list");
    renderPhoneShortcuts(data.shortcuts || []);
  } catch (error) {
    console.error(error);
    renderPhoneShortcuts([]);
  }
}

function collectEditableShortcuts() {
  return [...shortcutList.querySelectorAll(".shortcut-row")].map((row) => ({
    id: row.dataset.id,
    label: row.querySelector("[data-field='label']").value,
    key: normalizeKey(row.querySelector("[data-field='key']").value)
  }));
}

function renderEditableShortcuts() {
  shortcutList.innerHTML = "";

  for (const shortcut of editableShortcuts) {
    const row = document.createElement("article");
    row.className = "shortcut-row";
    row.dataset.id = shortcut.id;

    const label = document.createElement("input");
    label.dataset.field = "label";
    label.maxLength = 40;
    label.value = shortcut.label;
    label.placeholder = "Button label";

    const key = document.createElement("input");
    key.dataset.field = "key";
    key.maxLength = 40;
    key.value = shortcut.key;
    key.placeholder = "ctrl+s";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => {
      editableShortcuts = collectEditableShortcuts().filter((item) => item.id !== shortcut.id);
      renderEditableShortcuts();
      shortcutEditorStatus.textContent = "edited";
    });

    row.append(label, key, remove);
    shortcutList.append(row);
  }
}

async function loadEditableShortcuts() {
  try {
    const data = await adminApi("/api/admin/shortcuts/list");
    editableShortcuts = data.shortcuts || [];
    renderEditableShortcuts();
    shortcutEditorStatus.textContent = `${editableShortcuts.length} saved`;
  } catch (error) {
    console.error(error);
    shortcutEditorStatus.textContent = error.message;
  }
}

async function saveEditableShortcuts() {
  saveShortcuts.disabled = true;
  shortcutEditorStatus.textContent = "saving";
  try {
    const data = await adminApi("/api/admin/shortcuts/save", {
      shortcuts: collectEditableShortcuts()
    });
    editableShortcuts = data.shortcuts || [];
    renderEditableShortcuts();
    renderPhoneShortcuts(editableShortcuts);
    shortcutEditorStatus.textContent = "saved";
  } catch (error) {
    console.error(error);
    shortcutEditorStatus.textContent = error.message;
  } finally {
    saveShortcuts.disabled = false;
  }
}

function hasQueuedMove() {
  return Math.abs(pendingDx) >= 0.5 || Math.abs(pendingDy) >= 0.5;
}

function hasQueuedScroll() {
  return Math.abs(pendingScrollAmount) >= 1;
}

function scheduleMove() {
  if (moveFrame || moveInFlight) return;
  moveFrame = requestAnimationFrame(flushMove);
}

async function flushMove() {
  moveFrame = 0;
  if (moveInFlight || !hasQueuedMove()) return;

  const dx = Math.round(pendingDx);
  const dy = Math.round(pendingDy);
  pendingDx -= dx;
  pendingDy -= dy;
  if (!dx && !dy) return;

  moveInFlight = true;
  try {
    await api("/api/move", { dx, dy });
  } catch (error) {
    console.error(error);
  } finally {
    moveInFlight = false;
    if (hasQueuedMove()) scheduleMove();
  }
}

function waitForIceComplete(connection) {
  if (connection.iceGatheringState === "complete") return Promise.resolve();

  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, 3000);
    const handleChange = () => {
      if (connection.iceGatheringState !== "complete") return;
      clearTimeout(timeout);
      connection.removeEventListener("icegatheringstatechange", handleChange);
      resolve();
    };

    connection.addEventListener("icegatheringstatechange", handleChange);
  });
}

function setStreamStatus(text) {
  streamStatus.textContent = text;
}

async function stopViewingStream({ notify = true } = {}) {
  if (streamPeer) {
    streamPeer.close();
    streamPeer = null;
  }

  if (remoteMediaStream) {
    for (const track of remoteMediaStream.getTracks()) track.stop();
    remoteMediaStream = null;
  }

  remoteStream.srcObject = null;
  connectStream.disabled = false;
  stopStream.disabled = true;
  setStreamStatus("stopped");

  if (notify) {
    await api("/api/stream/stop-viewer").catch(() => {});
  }
}

async function connectToStream() {
  connectStream.disabled = true;
  stopStream.disabled = false;
  setStreamStatus("checking");

  try {
    await stopViewingStream({ notify: false });
    connectStream.disabled = true;
    stopStream.disabled = false;

    const { offer } = await api("/api/stream/read-offer");
    if (!offer) {
      throw new Error("open desktop stream first");
    }

    streamPeer = new RTCPeerConnection({ iceServers: [] });
    streamPeer.addEventListener("connectionstatechange", () => {
      if (!streamPeer) return;
      setStreamStatus(streamPeer.connectionState);
    });
    streamPeer.addEventListener("track", (event) => {
      remoteMediaStream = event.streams[0];
      remoteStream.srcObject = remoteMediaStream;
      setStreamStatus("streaming");
    });

    setStreamStatus("answering");
    await streamPeer.setRemoteDescription(offer);
    const answer = await streamPeer.createAnswer();
    await streamPeer.setLocalDescription(answer);
    await waitForIceComplete(streamPeer);
    await api("/api/stream/publish-answer", { answer: streamPeer.localDescription });
    setStreamStatus("connecting");
  } catch (error) {
    console.error(error);
    setStreamStatus(error.message);
    await stopViewingStream({ notify: false });
  }
}

function scheduleScroll() {
  if (scrollFrame || scrollInFlight) return;
  scrollFrame = requestAnimationFrame(flushScroll);
}

async function flushScroll() {
  scrollFrame = 0;
  if (scrollInFlight || !hasQueuedScroll()) return;

  const amount = Math.round(pendingScrollAmount);
  pendingScrollAmount -= amount;
  if (!amount) return;

  scrollInFlight = true;
  try {
    await api("/api/scroll", { amount });
  } catch (error) {
    console.error(error);
  } finally {
    scrollInFlight = false;
    if (hasQueuedScroll()) scheduleScroll();
  }
}

function getCentroid() {
  const points = [...activePointers.values()];
  if (!points.length) return null;

  const total = points.reduce((sum, point) => {
    sum.x += point.x;
    sum.y += point.y;
    return sum;
  }, { x: 0, y: 0 });

  return {
    x: total.x / points.length,
    y: total.y / points.length
  };
}

function clearLongPress() {
  if (!longPressTimer) return;
  clearTimeout(longPressTimer);
  longPressTimer = null;
}

function startLongPress() {
  clearLongPress();
  if (leftHeld || activePointers.size !== 1 || !gesture) return;

  longPressTimer = setTimeout(async () => {
    longPressTimer = null;
    if (!gesture || activePointers.size !== 1 || gesture.maxPointerCount !== 1) return;
    if (gesture.distance > LONG_PRESS_MOVE_LIMIT) return;

    autoDrag = true;
    holdLeft.classList.add("active");
    holdLeft.textContent = "Dragging";
    try {
      await api("/api/mouse", { button: "left", kind: "down" });
    } catch (error) {
      autoDrag = false;
      holdLeft.classList.remove("active");
      holdLeft.textContent = "Hold Left";
      console.error(error);
    }
  }, LONG_PRESS_MS);
}

function startGesture() {
  const centroid = getCentroid();
  gesture = {
    startedAt: performance.now(),
    distance: 0,
    maxPointerCount: activePointers.size,
    producedMovement: false,
    producedScroll: false,
    lastCentroid: centroid
  };

  if (activePointers.size === 1) {
    startLongPress();
  } else {
    clearLongPress();
  }
}

function refreshGestureForPointerCount() {
  if (!gesture) {
    startGesture();
    return;
  }

  gesture.maxPointerCount = Math.max(gesture.maxPointerCount, activePointers.size);
  gesture.lastCentroid = getCentroid();
  if (activePointers.size === 1 && gesture.maxPointerCount === 1) {
    startLongPress();
  } else {
    clearLongPress();
  }
}

async function releaseAutoDrag() {
  if (!autoDrag) return;

  autoDrag = false;
  holdLeft.classList.remove("active");
  holdLeft.textContent = "Hold Left";
  try {
    await api("/api/mouse", { button: "left", kind: "up" });
  } catch (error) {
    console.error(error);
  }
}

function finishGesture() {
  clearLongPress();
  const finished = gesture;
  gesture = null;

  if (autoDrag) {
    void releaseAutoDrag();
    return;
  }

  if (!finished) return;
  const duration = performance.now() - finished.startedAt;
  const isTap = duration <= TAP_MAX_MS && finished.distance <= TAP_MAX_DISTANCE && !finished.producedScroll;
  if (!isTap) return;

  if (finished.maxPointerCount === 1) {
    void api("/api/click", { button: "left" }).catch((error) => console.error(error));
  } else if (finished.maxPointerCount === 2) {
    void api("/api/click", { button: "right" }).catch((error) => console.error(error));
  }
}

pairForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  pairError.textContent = "";
  try {
    await api("/api/pair", { code: pairCode.value.trim() });
    showControls();
  } catch (error) {
    pairError.textContent = error.message;
  }
});

if (adminToken) {
  showControls();
  pairPanel.classList.add("hidden");
}

const savedSensitivity = Number(localStorage.getItem("deskctl:sensitivity"));
if (Number.isFinite(savedSensitivity)) {
  sensitivity.value = String(Math.max(0.8, Math.min(5, savedSensitivity)));
}
updateSensitivityLabel();

sensitivity.addEventListener("input", updateSensitivityLabel);

applyDisplaySettings();

themeToggle.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("deskctl:theme", nextTheme);
  applyDisplaySettings();
});

accentSelect.addEventListener("change", () => {
  localStorage.setItem("deskctl:accent", accentSelect.value);
  applyDisplaySettings();
});

["contextmenu", "selectstart", "dragstart"].forEach((eventName) => {
  pad.addEventListener(eventName, (event) => {
    event.preventDefault();
  });
  document.querySelector(".mouse-buttons")?.addEventListener(eventName, (event) => {
    event.preventDefault();
  });
});

pad.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  activePointers.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY
  });
  pad.setPointerCapture(event.pointerId);
  refreshGestureForPointerCount();
});

pad.addEventListener("pointermove", (event) => {
  if (!activePointers.has(event.pointerId) || !gesture) return;
  event.preventDefault();
  activePointers.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY
  });

  const centroid = getCentroid();
  if (!centroid || !gesture.lastCentroid) return;

  const dx = centroid.x - gesture.lastCentroid.x;
  const dy = centroid.y - gesture.lastCentroid.y;
  gesture.distance += Math.hypot(dx, dy);

  if (activePointers.size === 1 && gesture.maxPointerCount === 1) {
    if (!autoDrag && gesture.distance > LONG_PRESS_MOVE_LIMIT) clearLongPress();
    const moveSpeed = getMoveSpeed();
    pendingDx += dx * moveSpeed;
    pendingDy += dy * moveSpeed;
    gesture.producedMovement = true;
    scheduleMove();
  } else if (activePointers.size >= 2) {
    clearLongPress();
    pendingScrollAmount += -dy * SCROLL_SPEED;
    gesture.producedScroll = gesture.producedScroll || Math.abs(dy) >= 1;
    scheduleScroll();
  }

  gesture.lastCentroid = centroid;
});

pad.addEventListener("pointerup", (event) => {
  event.preventDefault();
  activePointers.delete(event.pointerId);
  if (activePointers.size === 0) {
    finishGesture();
  } else {
    refreshGestureForPointerCount();
  }
  scheduleMove();
  scheduleScroll();
});

pad.addEventListener("pointercancel", (event) => {
  event.preventDefault();
  activePointers.delete(event.pointerId);
  if (activePointers.size === 0) {
    finishGesture();
  } else {
    refreshGestureForPointerCount();
  }
  scheduleMove();
  scheduleScroll();
});

document.querySelectorAll("[data-click]").forEach((button) => {
  button.addEventListener("click", async () => {
    await api("/api/click", { button: button.dataset.click });
  });
});

document.querySelectorAll("[data-mouse-button]").forEach((button) => {
  const mouseButton = button.dataset.mouseButton;
  let pressed = false;
  let commandQueue = Promise.resolve();

  const sendMouse = (kind) => {
    commandQueue = commandQueue
      .then(() => api("/api/mouse", { button: mouseButton, kind }))
      .catch((error) => console.error(error));
    return commandQueue;
  };

  const release = async () => {
    if (!pressed) return;
    pressed = false;
    button.classList.remove("active");
    await sendMouse("up");
  };

  button.addEventListener("pointerdown", async (event) => {
    event.preventDefault();
    if (pressed) return;
    pressed = true;
    button.classList.add("active");
    button.setPointerCapture(event.pointerId);
    await sendMouse("down");
  });

  button.addEventListener("pointerup", (event) => {
    event.preventDefault();
    void release();
  });

  button.addEventListener("pointercancel", (event) => {
    event.preventDefault();
    void release();
  });

  button.addEventListener("lostpointercapture", () => {
    void release();
  });
});

document.querySelectorAll("[data-scroll]").forEach((button) => {
  button.addEventListener("click", async () => {
    await api("/api/scroll", { amount: Number(button.dataset.scroll) });
  });
});

document.querySelectorAll("[data-key]").forEach((button) => {
  button.addEventListener("click", async () => {
    await api("/api/key", { key: button.dataset.key });
  });
});

connectStream.addEventListener("click", () => {
  void connectToStream();
});

stopStream.addEventListener("click", () => {
  void stopViewingStream();
});

shortcutForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const label = shortcutLabel.value.trim();
  const key = normalizeKey(shortcutKey.value);
  if (!label || !key) return;

  editableShortcuts = collectEditableShortcuts();
  editableShortcuts.push({ id: createShortcutId(), label, key });
  shortcutLabel.value = "";
  shortcutKey.value = "";
  renderEditableShortcuts();
  shortcutEditorStatus.textContent = "edited";
});

saveShortcuts.addEventListener("click", () => {
  void saveEditableShortcuts();
});

holdLeft.addEventListener("click", async () => {
  leftHeld = !leftHeld;
  holdLeft.classList.toggle("active", leftHeld);
  holdLeft.textContent = leftHeld ? "Release Left" : "Hold Left";
  await api("/api/mouse", { button: "left", kind: leftHeld ? "down" : "up" });
});

panic.addEventListener("click", async () => {
  await releaseAutoDrag();
  if (leftHeld) {
    leftHeld = false;
    holdLeft.classList.remove("active");
    holdLeft.textContent = "Hold Left";
    await api("/api/mouse", { button: "left", kind: "up" });
  }
});

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = searchText.value.trim();
  if (!text) return;
  await api("/api/search", { text });
  searchText.value = "";
});

typeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = typeText.value;
  if (!text) return;
  await api("/api/type", { text });
  typeText.value = "";
});

api("/api/status")
  .then((status) => {
    if (status.paired) showControls();
  })
  .catch(() => {});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
}
