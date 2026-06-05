const pairPanel = document.querySelector("#pairPanel");
const controlPanel = document.querySelector("#controlPanel");
const pairForm = document.querySelector("#pairForm");
const pairCode = document.querySelector("#pairCode");
const pairError = document.querySelector("#pairError");
const pad = document.querySelector("#pad");
const panic = document.querySelector("#panic");
const themeToggle = document.querySelector("#themeToggle");
const accentSelect = document.querySelector("#accentSelect");
const remoteStream = document.querySelector("#remoteStream");
const connectStream = document.querySelector("#connectStream");
const stopStream = document.querySelector("#stopStream");
const streamStatus = document.querySelector("#streamStatus");
const sensitivity = document.querySelector("#sensitivity");
const sensitivityValue = document.querySelector("#sensitivityValue");
const shortcutDeck = document.querySelector("#shortcutDeck");
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
let customShortcuts = [];
let editableShortcuts = [];
let shortcutTrayOrder = [];
let openTrayId = "";
let trayDrag = null;
const adminToken = new URL(location.href).searchParams.get("admin") || "";

const DEFAULT_MOVE_SPEED = 2.6;
const SCROLL_SPEED = 12;
const TAP_MAX_MS = 280;
const TAP_MAX_DISTANCE = 14;
const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE_LIMIT = 10;
const TRAY_ORDER_KEY = "deskctl:shortcutTrayOrder";
const TRAY_OPEN_KEY = "deskctl:shortcutTrayOpenId";
const DEFAULT_OPEN_TRAY = "core";
const BUILT_IN_SHORTCUT_IDS = new Set(["address-bar", "copy", "paste", "save", "undo", "desktop"]);
const MAX_DROP_FILES = 5;
const MAX_DROP_FILE_BYTES = 8 * 1024 * 1024;
const MAX_DROP_TOTAL_BYTES = 16 * 1024 * 1024;

const trayPresets = [
  {
    id: "core",
    title: "Core",
    actions: [
      { id: "hold-left", label: "Hold Left", type: "mouseToggle" },
      { id: "esc", label: "Esc", type: "key", key: "esc" },
      { id: "enter", label: "Enter", type: "key", key: "enter" },
      { id: "desktop", label: "Show Desktop", type: "key", key: "win+d" }
    ]
  },
  {
    id: "scroll",
    title: "Scroll",
    actions: [
      { id: "scroll-up", label: "Scroll Up", type: "scroll", amount: 420 },
      { id: "space", label: "Space", type: "key", key: "space" },
      { id: "scroll-down", label: "Scroll Down", type: "scroll", amount: -420 }
    ]
  },
  {
    id: "browser",
    title: "Browser",
    actions: [
      { id: "address-bar", label: "Address Bar", type: "key", key: "ctrl+l" },
      { id: "video-fullscreen", label: "Video Fullscreen", type: "key", key: "f" },
      { id: "browser-fullscreen", label: "Browser Fullscreen", type: "key", key: "f11" }
    ]
  },
  {
    id: "media",
    title: "Media / Spotify",
    actions: [
      { id: "playpause", label: "Play/Pause", type: "key", key: "playpause" },
      { id: "mute", label: "Mute", type: "key", key: "mute" },
      { id: "volumedown", label: "Vol -", type: "key", key: "volumedown" },
      { id: "volumeup", label: "Vol +", type: "key", key: "volumeup" }
    ]
  },
  {
    id: "edit",
    title: "Edit / DaVinci",
    actions: [
      { id: "copy", label: "Copy", type: "key", key: "ctrl+c" },
      { id: "paste", label: "Paste", type: "key", key: "ctrl+v" },
      { id: "save", label: "Save", type: "key", key: "ctrl+s" },
      { id: "undo", label: "Undo", type: "key", key: "ctrl+z" }
    ]
  },
  {
    id: "text",
    title: "Text",
    actions: []
  },
  {
    id: "transfer",
    title: "Clipboard / Files",
    actions: []
  },
  {
    id: "custom",
    title: "Custom",
    actions: []
  }
];

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

function getTrayDefinitions() {
  const trays = trayPresets.map((tray) => ({ ...tray }));
  if (adminToken) {
    trays.push({ id: "admin", title: "Admin", actions: [] });
  }
  return trays;
}

function getDefaultTrayOrder() {
  return getTrayDefinitions().map((tray) => tray.id);
}

function normalizeTrayOrder(value) {
  const defaults = getDefaultTrayOrder();
  const allowed = new Set(defaults);
  const order = Array.isArray(value) ? value.filter((id) => allowed.has(id)) : [];
  const unique = [...new Set(order)];
  return [...unique, ...defaults.filter((id) => !unique.includes(id))];
}

function readTrayOrder() {
  try {
    return normalizeTrayOrder(JSON.parse(localStorage.getItem(TRAY_ORDER_KEY) || "[]"));
  } catch {
    return normalizeTrayOrder([]);
  }
}

function saveTrayOrder() {
  localStorage.setItem(TRAY_ORDER_KEY, JSON.stringify(shortcutTrayOrder));
}

function readOpenTrayId(order) {
  const saved = localStorage.getItem(TRAY_OPEN_KEY);
  if (saved && order.includes(saved)) return saved;
  if (order.includes(DEFAULT_OPEN_TRAY)) return DEFAULT_OPEN_TRAY;
  return order[0] || "";
}

function setOpenTray(id) {
  if (!shortcutTrayOrder.includes(id)) return;
  openTrayId = id;
  localStorage.setItem(TRAY_OPEN_KEY, openTrayId);
  renderShortcutDeck();
}

function setHoldLeftUi(labelOverride = "") {
  document.querySelectorAll("[data-action-id='hold-left']").forEach((button) => {
    button.classList.toggle("active", leftHeld || autoDrag);
    button.textContent = labelOverride || (leftHeld ? "Release Left" : "Hold Left");
  });
}

function getTrayById(id) {
  return getTrayDefinitions().find((tray) => tray.id === id);
}

function getTrayActions(tray) {
  if (tray.id === "custom") {
    return customShortcuts
      .filter((shortcut) => !BUILT_IN_SHORTCUT_IDS.has(shortcut.id))
      .map((shortcut) => ({
        id: shortcut.id,
        label: shortcut.label,
        title: shortcut.key,
        type: "customShortcut",
        shortcutId: shortcut.id
      }));
  }
  return tray.actions;
}

function createTrayButton(action) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.actionId = action.id;
  button.textContent = action.label;
  if (action.title || action.key) button.title = action.title || action.key;

  if (action.type === "mouseToggle") {
    button.classList.toggle("active", leftHeld || autoDrag);
    button.textContent = autoDrag ? "Dragging" : leftHeld ? "Release Left" : action.label;
  }

  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await runTrayAction(action);
    } catch (error) {
      console.error(error);
    } finally {
      button.disabled = false;
      setHoldLeftUi(autoDrag ? "Dragging" : "");
    }
  });

  return button;
}

function createTrayBody(tray, actions) {
  const body = document.createElement("div");
  body.className = "shortcut-tray-body";

  if (tray.id === "transfer") {
    body.append(createTransferPanel());
    return body;
  }

  if (tray.id === "text") {
    body.classList.add("tray-stack");
    searchForm.classList.remove("hidden");
    typeForm.classList.remove("hidden");
    body.append(searchForm, typeForm);
    return body;
  }

  if (tray.id === "admin") {
    body.classList.add("tray-stack");
    shortcutEditor.classList.remove("hidden");
    body.append(shortcutEditor);
    return body;
  }

  if (!actions.length) {
    const empty = document.createElement("p");
    empty.className = "tray-empty";
    empty.textContent = tray.id === "custom" ? "No custom shortcuts yet." : "No shortcuts in this tray.";
    body.append(empty);
    return body;
  }

  const grid = document.createElement("div");
  grid.className = "tray-action-grid";
  for (const action of actions) {
    grid.append(createTrayButton(action));
  }
  body.append(grid);
  return body;
}

function createTransferPanel() {
  const panel = document.createElement("div");
  panel.className = "transfer-panel";

  const phoneClipboard = document.createElement("form");
  phoneClipboard.className = "transfer-block";
  const phoneLabel = document.createElement("strong");
  phoneLabel.textContent = "Phone text -> PC clipboard";
  const phoneText = document.createElement("textarea");
  phoneText.maxLength = 20000;
  phoneText.placeholder = "Paste or type text to put on the PC clipboard";
  const setClipboard = document.createElement("button");
  setClipboard.type = "submit";
  setClipboard.textContent = "Set PC Clipboard";
  phoneClipboard.append(phoneLabel, phoneText, setClipboard);
  phoneClipboard.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      setClipboard.disabled = true;
      setTransferStatus("setting clipboard");
      await api("/api/clipboard/set", { text: phoneText.value });
      setTransferStatus("PC clipboard updated");
    } catch (error) {
      setTransferStatus(error.message);
    } finally {
      setClipboard.disabled = false;
    }
  });

  const pcClipboard = document.createElement("section");
  pcClipboard.className = "transfer-block";
  const pcLabel = document.createElement("strong");
  pcLabel.textContent = "PC clipboard -> phone";
  const pcText = document.createElement("textarea");
  pcText.readOnly = true;
  pcText.placeholder = "Tap Get PC Clipboard";
  const pcActions = document.createElement("div");
  pcActions.className = "transfer-actions";
  const getClipboard = document.createElement("button");
  getClipboard.type = "button";
  getClipboard.textContent = "Get PC Clipboard";
  const copyPhone = document.createElement("button");
  copyPhone.type = "button";
  copyPhone.textContent = "Copy on Phone";
  pcActions.append(getClipboard, copyPhone);
  pcClipboard.append(pcLabel, pcText, pcActions);
  getClipboard.addEventListener("click", async () => {
    try {
      getClipboard.disabled = true;
      setTransferStatus("reading clipboard");
      const data = await api("/api/clipboard/get");
      pcText.value = data.text || "";
      setTransferStatus(data.text ? "PC clipboard loaded" : "PC clipboard is empty");
    } catch (error) {
      setTransferStatus(error.message);
    } finally {
      getClipboard.disabled = false;
    }
  });
  copyPhone.addEventListener("click", async () => {
    if (!pcText.value) return;
    try {
      await navigator.clipboard.writeText(pcText.value);
      setTransferStatus("copied on phone");
    } catch {
      pcText.focus();
      pcText.select();
      setTransferStatus("select text and copy manually");
    }
  });

  const fileDrop = document.createElement("form");
  fileDrop.className = "transfer-block";
  const fileLabel = document.createElement("strong");
  fileLabel.textContent = "Phone files -> PC";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.multiple = true;
  const uploadFiles = document.createElement("button");
  uploadFiles.type = "submit";
  uploadFiles.textContent = "Send Files";
  fileDrop.append(fileLabel, fileInput, uploadFiles);
  fileDrop.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      uploadFiles.disabled = true;
      const files = [...fileInput.files];
      const payload = await readDropFiles(files);
      setTransferStatus("sending files");
      const result = await api("/api/files/drop", { files: payload });
      fileInput.value = "";
      setTransferStatus(`saved ${result.files.length} file(s) to data/dropbox`);
    } catch (error) {
      setTransferStatus(error.message);
    } finally {
      uploadFiles.disabled = false;
    }
  });

  const openLink = document.createElement("form");
  openLink.className = "transfer-block";
  const linkLabel = document.createElement("strong");
  linkLabel.textContent = "Open phone link on desktop";
  const linkRow = document.createElement("div");
  linkRow.className = "text-row";
  const linkInput = document.createElement("input");
  linkInput.type = "text";
  linkInput.inputMode = "url";
  linkInput.placeholder = "https://example.com";
  const linkButton = document.createElement("button");
  linkButton.type = "submit";
  linkButton.textContent = "Open";
  linkRow.append(linkInput, linkButton);
  openLink.append(linkLabel, linkRow);
  openLink.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = linkInput.value.trim();
    if (!text) return;
    try {
      linkButton.disabled = true;
      setTransferStatus("opening link");
      await api("/api/open-link", { text });
      linkInput.value = "";
      setTransferStatus("opened on desktop");
    } catch (error) {
      setTransferStatus(error.message);
    } finally {
      linkButton.disabled = false;
    }
  });

  const status = document.createElement("span");
  status.id = "transferStatus";
  status.className = "micro-status";
  status.textContent = "idle";

  panel.append(phoneClipboard, pcClipboard, fileDrop, openLink, status);
  return panel;
}

function setTransferStatus(text) {
  const status = document.querySelector("#transferStatus");
  if (status) status.textContent = text;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",").pop() : result);
    });
    reader.addEventListener("error", () => reject(reader.error || new Error("file read failed")));
    reader.readAsDataURL(file);
  });
}

async function readDropFiles(files) {
  if (!files.length) throw new Error("choose at least one file");
  if (files.length > MAX_DROP_FILES) throw new Error(`max ${MAX_DROP_FILES} files`);
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_DROP_TOTAL_BYTES) throw new Error("total upload is too large");

  const payload = [];
  for (const file of files) {
    if (file.size > MAX_DROP_FILE_BYTES) throw new Error(`${file.name} is too large`);
    payload.push({
      name: file.name,
      type: file.type,
      data: await readFileAsBase64(file)
    });
  }
  return payload;
}

function startTrayDrag(event, trayElement) {
  event.preventDefault();
  trayDrag = { element: trayElement, pointerId: event.pointerId, startedAt: performance.now() };
  trayElement.classList.add("is-dragging");
  document.body.classList.add("is-tray-dragging");
  document.addEventListener("pointermove", moveTrayDrag);
  document.addEventListener("pointerup", finishTrayDrag);
  document.addEventListener("pointercancel", finishTrayDrag);
}

function moveTrayDrag(event) {
  if (!trayDrag || event.pointerId !== trayDrag.pointerId) return;
  event.preventDefault();

  const dragging = trayDrag.element;
  const siblings = [...shortcutDeck.querySelectorAll(".shortcut-tray:not(.is-dragging)")];
  const before = siblings.find((item) => {
    const rect = item.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2;
  });

  shortcutDeck.insertBefore(dragging, before || null);
}

function finishTrayDrag() {
  if (!trayDrag) return;
  trayDrag.element.classList.remove("is-dragging");
  document.body.classList.remove("is-tray-dragging");
  document.removeEventListener("pointermove", moveTrayDrag);
  document.removeEventListener("pointerup", finishTrayDrag);
  document.removeEventListener("pointercancel", finishTrayDrag);
  shortcutTrayOrder = [...shortcutDeck.querySelectorAll(".shortcut-tray")].map((tray) => tray.dataset.trayId);
  shortcutTrayOrder = normalizeTrayOrder(shortcutTrayOrder);
  saveTrayOrder();
  trayDrag = null;
}

function renderShortcutDeck() {
  if (!shortcutTrayOrder.length) {
    shortcutTrayOrder = readTrayOrder();
  } else {
    shortcutTrayOrder = normalizeTrayOrder(shortcutTrayOrder);
  }
  if (!openTrayId || !shortcutTrayOrder.includes(openTrayId)) {
    openTrayId = readOpenTrayId(shortcutTrayOrder);
  }
  localStorage.setItem(TRAY_OPEN_KEY, openTrayId);

  shortcutDeck.innerHTML = "";

  for (const id of shortcutTrayOrder) {
    const tray = getTrayById(id);
    if (!tray) continue;

    const actions = getTrayActions(tray);
    const isOpen = id === openTrayId;
    const article = document.createElement("article");
    article.className = `shortcut-tray${isOpen ? " is-open" : ""}`;
    article.dataset.trayId = id;

    const header = document.createElement("div");
    header.className = "shortcut-tray-header";

    const dragHandle = document.createElement("button");
    dragHandle.type = "button";
    dragHandle.className = "tray-drag-handle";
    dragHandle.setAttribute("aria-label", `Drag ${tray.title} menu`);
    dragHandle.textContent = "Drag";
    dragHandle.addEventListener("pointerdown", (event) => startTrayDrag(event, article));

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "shortcut-tray-toggle";
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.addEventListener("click", () => {
      if (id === openTrayId) return;
      setOpenTray(id);
    });

    const title = document.createElement("span");
    title.className = "tray-title";
    title.textContent = tray.title;

    const meta = document.createElement("span");
    meta.className = "tray-meta";
    meta.textContent = tray.id === "text" || tray.id === "transfer" || tray.id === "admin" ? "" : String(actions.length);

    const chevron = document.createElement("span");
    chevron.className = "tray-chevron";
    chevron.textContent = "v";

    toggle.append(title, meta, chevron);
    header.append(dragHandle, toggle);
    article.append(header);
    if (isOpen) {
      article.append(createTrayBody(tray, actions));
    }
    shortcutDeck.append(article);
  }
}

async function runTrayAction(action) {
  if (action.type === "key") {
    await api("/api/key", { key: action.key });
    return;
  }
  if (action.type === "scroll") {
    await api("/api/scroll", { amount: action.amount });
    return;
  }
  if (action.type === "customShortcut") {
    await api("/api/shortcuts/run", { id: action.shortcutId });
    return;
  }
  if (action.type === "mouseToggle") {
    await toggleLeftHold();
  }
}

async function toggleLeftHold() {
  const nextState = !leftHeld;
  leftHeld = nextState;
  setHoldLeftUi();
  try {
    await api("/api/mouse", { button: "left", kind: nextState ? "down" : "up" });
  } catch (error) {
    leftHeld = !nextState;
    setHoldLeftUi();
    throw error;
  }
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
  renderShortcutDeck();
  void loadPhoneShortcuts();
  if (!shortcutPollTimer) {
    shortcutPollTimer = setInterval(() => {
      void loadPhoneShortcuts();
    }, 5000);
  }
  if (adminToken) {
    void loadEditableShortcuts();
  }
}

function renderPhoneShortcuts(shortcuts) {
  customShortcuts = shortcuts;
  renderShortcutDeck();
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
    setHoldLeftUi("Dragging");
    try {
      await api("/api/mouse", { button: "left", kind: "down" });
    } catch (error) {
      autoDrag = false;
      setHoldLeftUi();
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
  setHoldLeftUi();
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

function cancelTouchpadGesture() {
  clearLongPress();

  for (const pointerId of activePointers.keys()) {
    try {
      if (pad.hasPointerCapture(pointerId)) pad.releasePointerCapture(pointerId);
    } catch {}
  }

  activePointers.clear();
  gesture = null;
  pendingDx = 0;
  pendingDy = 0;
  pendingScrollAmount = 0;

  if (autoDrag) {
    void releaseAutoDrag();
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

const savedSensitivityRaw = localStorage.getItem("deskctl:sensitivity");
if (savedSensitivityRaw !== null) {
  const savedSensitivity = Number(savedSensitivityRaw);
  if (Number.isFinite(savedSensitivity)) {
    sensitivity.value = String(Math.max(0.8, Math.min(5, savedSensitivity)));
  }
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
  if (event.isPrimary && activePointers.size > 0 && !activePointers.has(event.pointerId)) {
    cancelTouchpadGesture();
  }

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
  cancelTouchpadGesture();
});

pad.addEventListener("lostpointercapture", (event) => {
  if (!activePointers.has(event.pointerId)) return;
  cancelTouchpadGesture();
});

window.addEventListener("blur", cancelTouchpadGesture);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") cancelTouchpadGesture();
});
window.addEventListener("pagehide", cancelTouchpadGesture);

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

panic.addEventListener("click", async () => {
  await releaseAutoDrag();
  if (leftHeld) {
    leftHeld = false;
    setHoldLeftUi();
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
