const adminStatus = document.querySelector("#adminStatus");
const shortcutForm = document.querySelector("#shortcutForm");
const shortcutLabel = document.querySelector("#shortcutLabel");
const shortcutKey = document.querySelector("#shortcutKey");
const shortcutList = document.querySelector("#shortcutList");
const saveShortcuts = document.querySelector("#saveShortcuts");
const adminToken = new URL(location.href).searchParams.get("token") || "";

let shortcuts = [];

function setStatus(text) {
  adminStatus.textContent = text;
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\+\+/g, "+")
    .replace(/^\+|\+$/g, "");
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `shortcut-${Date.now()}-${Math.round(Math.random() * 10000)}`;
}

async function api(path, body = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: adminToken, ...body })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data;
}

function collectShortcutsFromDom() {
  return [...shortcutList.querySelectorAll(".shortcut-row")].map((row) => ({
    id: row.dataset.id,
    label: row.querySelector("[data-field='label']").value,
    key: normalizeKey(row.querySelector("[data-field='key']").value)
  }));
}

function renderShortcuts() {
  shortcutList.innerHTML = "";

  for (const shortcut of shortcuts) {
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
      shortcuts = collectShortcutsFromDom().filter((item) => item.id !== shortcut.id);
      renderShortcuts();
      setStatus("edited");
    });

    row.append(label, key, remove);
    shortcutList.append(row);
  }
}

async function loadShortcuts() {
  if (!adminToken) {
    setStatus("missing token");
    return;
  }

  const data = await api("/api/admin/shortcuts/list");
  shortcuts = data.shortcuts || [];
  renderShortcuts();
  setStatus(`${shortcuts.length} saved`);
}

async function saveCurrentShortcuts() {
  saveShortcuts.disabled = true;
  setStatus("saving");
  try {
    const data = await api("/api/admin/shortcuts/save", {
      shortcuts: collectShortcutsFromDom()
    });
    shortcuts = data.shortcuts || [];
    renderShortcuts();
    setStatus("saved");
  } catch (error) {
    console.error(error);
    setStatus(error.message);
  } finally {
    saveShortcuts.disabled = false;
  }
}

shortcutForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const label = shortcutLabel.value.trim();
  const key = normalizeKey(shortcutKey.value);
  if (!label || !key) return;

  shortcuts = collectShortcutsFromDom();
  shortcuts.push({ id: createId(), label, key });
  shortcutLabel.value = "";
  shortcutKey.value = "";
  renderShortcuts();
  setStatus("edited");
});

saveShortcuts.addEventListener("click", () => {
  void saveCurrentShortcuts();
});

void loadShortcuts().catch((error) => {
  console.error(error);
  setStatus(error.message);
});
