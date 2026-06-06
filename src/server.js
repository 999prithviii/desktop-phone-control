import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const dataDir = path.join(rootDir, "data");
const dropboxDir = path.join(dataDir, "dropbox");
const shortcutsPath = path.join(dataDir, "shortcuts.json");
const helperPath = path.join(__dirname, "control-helper.ps1");

const host = process.env.DESKCTL_HOST || "0.0.0.0";
const port = Number(process.env.DESKCTL_PORT || "8789");
let sessionToken = crypto.randomBytes(32).toString("hex");
const pairCode = String(crypto.randomInt(100000, 999999));
const streamKey = crypto.randomBytes(18).toString("base64url");
const adminKey = crypto.randomBytes(18).toString("base64url");
const setupKey = crypto.randomBytes(18).toString("base64url");
const streamSession = {
  offer: null,
  answer: null,
  updatedAt: 0
};
const MAX_CLIPBOARD_TEXT_LENGTH = 20000;
const MAX_DROPPED_FILES = 5;
const MAX_DROP_FILE_BYTES = 8 * 1024 * 1024;
const MAX_DROP_TOTAL_BYTES = 16 * 1024 * 1024;
const PAIR_ATTEMPT_LIMIT = 3;
const PAIR_ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
const PAIR_TOKEN_TTL_MS = 5 * 60 * 1000;
const HEARTBEAT_TIMEOUT_MS = 30 * 1000;
const pairAttempts = new Map();
let activePairToken = null;
const connectedDevice = {
  connected: false,
  address: "",
  userAgent: "",
  pairedAt: 0,
  lastSeenAt: 0
};
const trustedDevice = {
  token: "",
  address: "",
  userAgent: "",
  pairedAt: 0,
  lastSeenAt: 0
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const modifierKeyAllowlist = new Set(["ctrl", "alt", "shift", "win"]);
const baseKeyAllowlist = new Set([
  "esc",
  "enter",
  "space",
  "tab",
  "backspace",
  "up",
  "down",
  "left",
  "right",
  "delete",
  "home",
  "end",
  "pageup",
  "pagedown",
  "insert",
  "capslock",
  "f11",
  "playpause",
  "volumeup",
  "volumedown",
  "mute",
  ...Array.from({ length: 26 }, (_, index) => String.fromCharCode(97 + index)),
  ...Array.from({ length: 10 }, (_, index) => String(index)),
  ...Array.from({ length: 12 }, (_, index) => `f${index + 1}`)
]);

const defaultShortcuts = [
  { id: "address-bar", label: "Address Bar", key: "ctrl+l" },
  { id: "copy", label: "Copy", key: "ctrl+c" },
  { id: "paste", label: "Paste", key: "ctrl+v" },
  { id: "save", label: "Save", key: "ctrl+s" },
  { id: "undo", label: "Undo", key: "ctrl+z" },
  { id: "desktop", label: "Show Desktop", key: "win+d" }
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

class ControlHelper {
  constructor(scriptPath) {
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = "";
    this.queuedMoveDx = 0;
    this.queuedMoveDy = 0;
    this.moveInFlight = false;
    this.queuedScrollAmount = 0;
    this.scrollInFlight = false;
    this.available = true;
    this.child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Sta",
      "-File",
      scriptPath
    ], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });

    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.onStdout(chunk));
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk) => {
      const text = chunk.trim();
      if (text) console.error(`[helper] ${text}`);
    });
    this.child.on("error", (error) => {
      this.available = false;
      this.rejectPending(`control helper failed: ${error.message}`);
    });
    this.child.on("exit", (code) => {
      this.available = false;
      this.rejectPending(`control helper exited with code ${code}`);
    });
    this.child.stdin.on("error", (error) => {
      this.available = false;
      this.rejectPending(`control helper input failed: ${error.message}`);
    });
  }

  rejectPending(message) {
    for (const { reject, timeout } of this.pending.values()) {
      clearTimeout(timeout);
      reject(new Error(message));
    }
    this.pending.clear();
  }

  onStdout(chunk) {
    this.buffer += chunk;
    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line) this.resolveLine(line);
      newlineIndex = this.buffer.indexOf("\n");
    }
  }

  resolveLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      console.error(`[helper:bad-json] ${line}`);
      return;
    }

    const entry = this.pending.get(message.id);
    if (!entry) return;
    clearTimeout(entry.timeout);
    this.pending.delete(message.id);

    if (message.ok) {
      entry.resolve(message.data ?? null);
    } else {
      entry.reject(new Error(message.error || "control helper command failed"));
    }
  }

  send(action, payload = {}) {
    if (!this.child || this.child.killed || !this.available) {
      return Promise.reject(new Error("control helper is not running"));
    }

    const id = this.nextId++;
    const command = { id, action, ...payload };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`control helper timed out for action ${action}`));
      }, 5000);

      this.pending.set(id, { resolve, reject, timeout });
      this.child.stdin.write(`${JSON.stringify(command)}\n`, "utf8", (error) => {
        if (!error) return;
        const entry = this.pending.get(id);
        if (!entry) return;
        clearTimeout(entry.timeout);
        this.pending.delete(id);
        entry.reject(error);
      });
    });
  }

  enqueueMove(dx, dy) {
    if (!this.child || this.child.killed || !this.available) {
      throw new Error("control helper is not running");
    }

    this.queuedMoveDx = normalizeNumber(this.queuedMoveDx + dx, -1000, 1000);
    this.queuedMoveDy = normalizeNumber(this.queuedMoveDy + dy, -1000, 1000);
    void this.flushMove();
  }

  async flushMove() {
    if (this.moveInFlight) return;

    const dx = Math.round(this.queuedMoveDx);
    const dy = Math.round(this.queuedMoveDy);
    this.queuedMoveDx -= dx;
    this.queuedMoveDy -= dy;
    if (!dx && !dy) return;

    this.moveInFlight = true;
    try {
      await this.send("move", { dx, dy });
    } catch (error) {
      console.error(`[helper:move] ${error.message}`);
    } finally {
      this.moveInFlight = false;
      if (Math.abs(this.queuedMoveDx) >= 0.5 || Math.abs(this.queuedMoveDy) >= 0.5) {
        void this.flushMove();
      }
    }
  }

  enqueueScroll(amount) {
    if (!this.child || this.child.killed || !this.available) {
      throw new Error("control helper is not running");
    }

    this.queuedScrollAmount = normalizeNumber(this.queuedScrollAmount + amount, -2400, 2400);
    void this.flushScroll();
  }

  async flushScroll() {
    if (this.scrollInFlight) return;

    const amount = Math.round(this.queuedScrollAmount);
    this.queuedScrollAmount -= amount;
    if (!amount) return;

    this.scrollInFlight = true;
    try {
      await this.send("scroll", { amount });
    } catch (error) {
      console.error(`[helper:scroll] ${error.message}`);
    } finally {
      this.scrollInFlight = false;
      if (Math.abs(this.queuedScrollAmount) >= 1) {
        void this.flushScroll();
      }
    }
  }
}

const helper = new ControlHelper(helperPath);
let shortcuts = loadShortcuts();

function getLanUrls() {
  const urls = [];
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) {
        urls.push(`http://${entry.address}:${port}`);
      }
    }
  }
  return urls;
}

function getPreferredLanUrl() {
  return getLanUrls()[0] || `http://127.0.0.1:${port}`;
}

function getLocalUrl(pathname) {
  return `http://127.0.0.1:${port}${pathname}`;
}

function createPairToken() {
  const now = Date.now();
  activePairToken = {
    value: crypto.randomBytes(24).toString("base64url"),
    createdAt: now,
    expiresAt: now + PAIR_TOKEN_TTL_MS,
    usedAt: 0
  };
  return activePairToken;
}

function getActivePairToken() {
  if (!activePairToken || Date.now() >= activePairToken.expiresAt || activePairToken.usedAt) {
    return createPairToken();
  }
  return activePairToken;
}

function getPairTokenStatus() {
  const token = getActivePairToken();
  const phoneUrl = new URL(getPreferredLanUrl());
  phoneUrl.searchParams.set("pairToken", token.value);
  return {
    url: phoneUrl.toString(),
    expiresAt: token.expiresAt,
    expiresIn: Math.max(0, Math.ceil((token.expiresAt - Date.now()) / 1000))
  };
}

function isPairTokenValid(value) {
  return (
    activePairToken &&
    !activePairToken.usedAt &&
    Date.now() < activePairToken.expiresAt &&
    String(value || "") === activePairToken.value
  );
}

function rotateSession() {
  sessionToken = crypto.randomBytes(32).toString("hex");
  return sessionToken;
}

function createCookie(name, value, options = "") {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Strict; Path=/${options ? `; ${options}` : ""}`;
}

function markConnected(req) {
  const now = Date.now();
  connectedDevice.connected = true;
  connectedDevice.address = getClientAddress(req);
  connectedDevice.userAgent = String(req.headers["user-agent"] || "").slice(0, 160);
  connectedDevice.pairedAt = now;
  connectedDevice.lastSeenAt = now;
}

function trustConnectedDevice(req) {
  const now = Date.now();
  trustedDevice.token = crypto.randomBytes(32).toString("base64url");
  trustedDevice.address = getClientAddress(req);
  trustedDevice.userAgent = String(req.headers["user-agent"] || "").slice(0, 160);
  trustedDevice.pairedAt = now;
  trustedDevice.lastSeenAt = now;
  return trustedDevice.token;
}

function clearTrustedDevice() {
  trustedDevice.token = "";
  trustedDevice.address = "";
  trustedDevice.userAgent = "";
  trustedDevice.pairedAt = 0;
  trustedDevice.lastSeenAt = 0;
}

function markDisconnected() {
  connectedDevice.connected = false;
  connectedDevice.lastSeenAt = 0;
  createPairToken();
}

function refreshConnectionState() {
  if (connectedDevice.connected && Date.now() - connectedDevice.lastSeenAt > HEARTBEAT_TIMEOUT_MS) {
    markDisconnected();
  }
}

function getConnectionStatus() {
  refreshConnectionState();
  const trusted = Boolean(trustedDevice.token);
  return {
    connected: connectedDevice.connected,
    address: connectedDevice.connected ? connectedDevice.address : "",
    pairedAt: connectedDevice.connected ? connectedDevice.pairedAt : 0,
    lastSeenAt: connectedDevice.connected ? connectedDevice.lastSeenAt : 0,
    heartbeatTimeoutSeconds: HEARTBEAT_TIMEOUT_MS / 1000,
    trusted,
    inactiveTrusted: trusted && !connectedDevice.connected,
    trustedAddress: trusted && !connectedDevice.connected ? trustedDevice.address : "",
    trustedLastSeenAt: trusted ? trustedDevice.lastSeenAt : 0
  };
}

function hasSetupKey(body) {
  return String(body.token || "") === setupKey;
}

function setSessionCookie(res, reconnectToken = "") {
  const cookies = [createCookie("deskctl", rotateSession())];
  if (reconnectToken) cookies.push(createCookie("deskctl_reconnect", reconnectToken));
  res.setHeader("set-cookie", cookies);
}

function clearSessionCookie(res) {
  res.setHeader("set-cookie", [
    createCookie("deskctl", "", "Max-Age=0"),
    createCookie("deskctl_reconnect", "", "Max-Age=0")
  ]);
}

async function releaseAllMouseButtons() {
  await Promise.allSettled([
    helper.send("mouse", { button: "left", kind: "up" }),
    helper.send("mouse", { button: "right", kind: "up" })
  ]);
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  });
  res.end(body);
}

function parseCookies(header) {
  const cookies = new Map();
  for (const item of String(header || "").split(";")) {
    const index = item.indexOf("=");
    if (index < 0) continue;
    cookies.set(item.slice(0, index).trim(), decodeURIComponent(item.slice(index + 1).trim()));
  }
  return cookies;
}

function isAuthorized(req) {
  refreshConnectionState();
  return connectedDevice.connected && parseCookies(req.headers.cookie).get("deskctl") === sessionToken;
}

function getClientAddress(req) {
  return String(req.socket.remoteAddress || "unknown").replace(/^::ffff:/, "");
}

function getPairRetryAfter(req) {
  const address = getClientAddress(req);
  const now = Date.now();
  const recent = (pairAttempts.get(address) || []).filter(
    (attemptedAt) => now - attemptedAt < PAIR_ATTEMPT_WINDOW_MS
  );

  if (!recent.length) {
    pairAttempts.delete(address);
    return 0;
  }

  pairAttempts.set(address, recent);
  if (recent.length < PAIR_ATTEMPT_LIMIT) return 0;
  return Math.max(1, Math.ceil((PAIR_ATTEMPT_WINDOW_MS - (now - recent[0])) / 1000));
}

function recordPairFailure(req) {
  const address = getClientAddress(req);
  const now = Date.now();
  const recent = (pairAttempts.get(address) || []).filter(
    (attemptedAt) => now - attemptedAt < PAIR_ATTEMPT_WINDOW_MS
  );
  recent.push(now);
  pairAttempts.set(address, recent);
}

function clearPairFailures(req) {
  pairAttempts.delete(getClientAddress(req));
}

function assertSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const hostHeader = req.headers.host;
    return hostHeader && originUrl.host === hostHeader;
  } catch {
    return false;
  }
}

async function readJson(req, maxBytes = 4096) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(413, "request body too large");
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid JSON");
  }
}

function normalizeNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(min, Math.min(max, number));
}

function normalizeKeyCombo(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\+\+/g, "+")
    .replace(/^\+|\+$/g, "");
}

function isAllowedKeyCombo(value) {
  const combo = normalizeKeyCombo(value);
  if (!combo || combo.length > 40) return false;

  const parts = combo.split("+").filter(Boolean);
  if (!parts.length || parts.length > 4) return false;

  let baseCount = 0;
  const seen = new Set();
  for (const part of parts) {
    if (seen.has(part)) return false;
    seen.add(part);

    if (modifierKeyAllowlist.has(part)) continue;
    if (!baseKeyAllowlist.has(part)) return false;
    baseCount++;
  }

  return baseCount === 1;
}

function normalizeShortcutId(value, fallback) {
  const id = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

  return id || fallback;
}

function sanitizeShortcuts(value) {
  if (!Array.isArray(value)) throw new Error("shortcuts must be an array");
  if (value.length > 60) throw new Error("too many shortcuts");

  const usedIds = new Set();
  return value.map((item, index) => {
    const label = String(item?.label || "").trim().replace(/\s+/g, " ").slice(0, 40);
    const key = normalizeKeyCombo(item?.key);
    if (!label) throw new Error(`shortcut ${index + 1} needs a label`);
    if (!isAllowedKeyCombo(key)) throw new Error(`shortcut ${label} has an unsupported key combo`);

    const fallback = `shortcut-${index + 1}`;
    let id = normalizeShortcutId(item?.id, fallback);
    while (usedIds.has(id)) id = `${id}-${index + 1}`;
    usedIds.add(id);

    return { id, label, key };
  });
}

function loadShortcuts() {
  try {
    const text = fs.readFileSync(shortcutsPath, "utf8");
    return sanitizeShortcuts(JSON.parse(text));
  } catch {
    return defaultShortcuts;
  }
}

function saveShortcuts(nextShortcuts) {
  const cleanShortcuts = sanitizeShortcuts(nextShortcuts);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(shortcutsPath, `${JSON.stringify(cleanShortcuts, null, 2)}\n`, "utf8");
  return cleanShortcuts;
}

function sanitizeFileName(value, fallback) {
  const cleaned = String(value || "")
    .replace(/[/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

function createDropFileName(originalName, index) {
  const parsed = path.parse(sanitizeFileName(originalName, `file-${index + 1}`));
  const base = (parsed.name || `file-${index + 1}`).slice(0, 80);
  const ext = parsed.ext.slice(0, 20);
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${index + 1}-${base}${ext}`;
}

function isPathInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function saveDroppedFiles(files) {
  if (!Array.isArray(files)) throw new Error("files must be an array");
  if (!files.length) throw new Error("no files selected");
  if (files.length > MAX_DROPPED_FILES) throw new Error(`too many files; max ${MAX_DROPPED_FILES}`);

  let totalBytes = 0;
  const stagedFiles = files.map((file, index) => {
    const data = String(file?.data || "");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new Error("invalid file data");

    const buffer = Buffer.from(data, "base64");
    totalBytes += buffer.length;
    if (!buffer.length) throw new Error(`file ${index + 1} is empty`);
    if (buffer.length > MAX_DROP_FILE_BYTES) throw new Error(`file ${index + 1} is too large`);
    if (totalBytes > MAX_DROP_TOTAL_BYTES) throw new Error("total upload is too large");

    const fileName = createDropFileName(file?.name, index);
    const filePath = path.resolve(dropboxDir, fileName);
    if (!isPathInside(dropboxDir, filePath)) throw new Error("invalid file path");

    return {
      name: fileName,
      bytes: buffer.length,
      buffer,
      filePath
    };
  });

  fs.mkdirSync(dropboxDir, { recursive: true });
  const writtenPaths = [];
  try {
    for (const file of stagedFiles) {
      fs.writeFileSync(file.filePath, file.buffer);
      writtenPaths.push(file.filePath);
    }
  } catch (error) {
    for (const writtenPath of writtenPaths) {
      try {
        fs.rmSync(writtenPath, { force: true });
      } catch {}
    }
    throw error;
  }

  return stagedFiles.map(({ name, bytes }) => ({ name, bytes }));
}

function normalizeOpenText(value) {
  const text = String(value || "").trim().slice(0, 1000);
  if (!text) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return text;
  if (/^[^\s]+\.[^\s]+/.test(text)) return `https://${text}`;
  return text;
}

function hasAdminKey(body) {
  return String(body.token || "") === adminKey;
}

function isValidSessionDescription(value) {
  return (
    value &&
    (value.type === "offer" || value.type === "answer") &&
    typeof value.sdp === "string" &&
    value.sdp.length > 0 &&
    value.sdp.length < 60000
  );
}

function hasStreamKey(body) {
  return String(body.token || "") === streamKey;
}

function resetStreamSession() {
  streamSession.offer = null;
  streamSession.answer = null;
  streamSession.updatedAt = Date.now();
}

async function handleApi(req, res, pathname) {
  if (req.method !== "POST" && pathname !== "/api/status") {
    sendJson(res, 405, { ok: false, error: "method not allowed" });
    return;
  }

  if (!assertSameOrigin(req)) {
    sendJson(res, 403, { ok: false, error: "bad origin" });
    return;
  }

  if (pathname === "/api/status") {
    sendJson(res, 200, { ok: true, paired: isAuthorized(req), connection: getConnectionStatus() });
    return;
  }

  if (pathname === "/api/files/drop" && !isAuthorized(req)) {
    sendJson(res, 401, { ok: false, error: "not paired" });
    return;
  }

  const body = await readJson(
    req,
    pathname === "/api/files/drop"
      ? MAX_DROP_TOTAL_BYTES * 2
      : pathname === "/api/clipboard/set"
        ? MAX_CLIPBOARD_TEXT_LENGTH + 1024
      : pathname.startsWith("/api/stream/") || pathname.startsWith("/api/admin/") || pathname.startsWith("/api/setup/")
        ? 65536
        : 4096
  );

  if (pathname === "/api/setup/info") {
    if (!hasSetupKey(body)) {
      sendJson(res, 403, { ok: false, error: "bad setup token" });
      return;
    }

    const connection = getConnectionStatus();
    const tokenStatus = connection.connected ? { url: "", expiresAt: 0, expiresIn: 0 } : getPairTokenStatus();
    sendJson(res, 200, {
      ok: true,
      pairCode,
      lanUrls: getLanUrls(),
      preferredPhoneUrl: getPreferredLanUrl(),
      senderUrl: getLocalUrl(`/sender.html?token=${streamKey}`),
      pairTokenUrl: tokenStatus.url,
      pairTokenExpiresAt: tokenStatus.expiresAt,
      pairTokenExpiresIn: tokenStatus.expiresIn,
      connection
    });
    return;
  }

  if (pathname === "/api/setup/regenerate") {
    if (!hasSetupKey(body)) {
      sendJson(res, 403, { ok: false, error: "bad setup token" });
      return;
    }

    if (getConnectionStatus().connected) {
      sendJson(res, 409, { ok: false, error: "phone already connected" });
      return;
    }

    createPairToken();
    const tokenStatus = getPairTokenStatus();
    sendJson(res, 200, {
      ok: true,
      pairTokenUrl: tokenStatus.url,
      pairTokenExpiresAt: tokenStatus.expiresAt,
      pairTokenExpiresIn: tokenStatus.expiresIn,
      connection: getConnectionStatus()
    });
    return;
  }

  if (pathname === "/api/stream/publish-offer") {
    if (!hasStreamKey(body)) {
      sendJson(res, 403, { ok: false, error: "bad stream token" });
      return;
    }
    if (!isValidSessionDescription(body.offer) || body.offer.type !== "offer") {
      sendJson(res, 400, { ok: false, error: "invalid offer" });
      return;
    }

    streamSession.offer = body.offer;
    streamSession.answer = null;
    streamSession.updatedAt = Date.now();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/stream/read-answer") {
    if (!hasStreamKey(body)) {
      sendJson(res, 403, { ok: false, error: "bad stream token" });
      return;
    }
    sendJson(res, 200, { ok: true, answer: streamSession.answer, updatedAt: streamSession.updatedAt });
    return;
  }

  if (pathname === "/api/stream/stop-sender") {
    if (!hasStreamKey(body)) {
      sendJson(res, 403, { ok: false, error: "bad stream token" });
      return;
    }
    resetStreamSession();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/admin/shortcuts/list") {
    if (!hasAdminKey(body)) {
      sendJson(res, 403, { ok: false, error: "bad admin token" });
      return;
    }

    sendJson(res, 200, { ok: true, shortcuts });
    return;
  }

  if (pathname === "/api/admin/shortcuts/save") {
    if (!hasAdminKey(body)) {
      sendJson(res, 403, { ok: false, error: "bad admin token" });
      return;
    }

    try {
      shortcuts = saveShortcuts(body.shortcuts);
      sendJson(res, 200, { ok: true, shortcuts });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || "invalid shortcuts" });
    }
    return;
  }

  if (pathname === "/api/pair") {
    const retryAfter = getPairRetryAfter(req);
    if (retryAfter > 0) {
      res.setHeader("retry-after", String(retryAfter));
      sendJson(res, 429, { ok: false, error: "too many pairing attempts", retryAfter });
      return;
    }

    if (String(body.code || "") !== pairCode) {
      recordPairFailure(req);
      sendJson(res, 401, { ok: false, error: "wrong pairing code" });
      return;
    }

    clearPairFailures(req);
    if (activePairToken && !activePairToken.usedAt) activePairToken.usedAt = Date.now();
    markConnected(req);
    setSessionCookie(res, trustConnectedDevice(req));
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/pair-token") {
    if (getConnectionStatus().connected) {
      sendJson(res, 409, { ok: false, error: "phone already connected" });
      return;
    }

    if (!isPairTokenValid(body.token)) {
      sendJson(res, 410, { ok: false, error: "pairing QR expired or already used" });
      return;
    }

    activePairToken.usedAt = Date.now();
    clearPairFailures(req);
    markConnected(req);
    setSessionCookie(res, trustConnectedDevice(req));
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/reconnect") {
    const reconnectToken = parseCookies(req.headers.cookie).get("deskctl_reconnect") || "";
    if (!trustedDevice.token || reconnectToken !== trustedDevice.token) {
      sendJson(res, 401, { ok: false, error: "reconnect unavailable" });
      return;
    }

    markConnected(req);
    trustedDevice.address = getClientAddress(req);
    trustedDevice.userAgent = String(req.headers["user-agent"] || "").slice(0, 160);
    trustedDevice.lastSeenAt = Date.now();
    setSessionCookie(res);
    sendJson(res, 200, { ok: true, connection: getConnectionStatus() });
    return;
  }

  if (!isAuthorized(req)) {
    sendJson(res, 401, { ok: false, error: "not paired" });
    return;
  }

  if (pathname === "/api/heartbeat") {
    connectedDevice.lastSeenAt = Date.now();
    if (trustedDevice.token) trustedDevice.lastSeenAt = connectedDevice.lastSeenAt;
    sendJson(res, 200, { ok: true, connection: getConnectionStatus() });
    return;
  }

  if (pathname === "/api/disconnect") {
    await releaseAllMouseButtons();
    rotateSession();
    clearTrustedDevice();
    markDisconnected();
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/shortcuts/list") {
    sendJson(res, 200, { ok: true, shortcuts });
    return;
  }

  if (pathname === "/api/shortcuts/run") {
    const id = String(body.id || "");
    const shortcut = shortcuts.find((item) => item.id === id);
    if (!shortcut) {
      sendJson(res, 404, { ok: false, error: "shortcut not found" });
      return;
    }
    if (!isAllowedKeyCombo(shortcut.key)) {
      sendJson(res, 400, { ok: false, error: "shortcut key not allowed" });
      return;
    }

    await helper.send("key", { key: shortcut.key });
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/stream/status") {
    sendJson(res, 200, {
      ok: true,
      hasOffer: Boolean(streamSession.offer),
      hasAnswer: Boolean(streamSession.answer),
      updatedAt: streamSession.updatedAt
    });
    return;
  }

  if (pathname === "/api/stream/read-offer") {
    sendJson(res, 200, { ok: true, offer: streamSession.offer, updatedAt: streamSession.updatedAt });
    return;
  }

  if (pathname === "/api/stream/publish-answer") {
    if (!isValidSessionDescription(body.answer) || body.answer.type !== "answer") {
      sendJson(res, 400, { ok: false, error: "invalid answer" });
      return;
    }

    streamSession.answer = body.answer;
    streamSession.updatedAt = Date.now();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/stream/stop-viewer") {
    streamSession.answer = null;
    streamSession.updatedAt = Date.now();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/move") {
    const dx = normalizeNumber(body.dx, -200, 200);
    const dy = normalizeNumber(body.dy, -200, 200);
    helper.enqueueMove(dx, dy);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/click") {
    const button = body.button === "right" ? "right" : "left";
    await helper.send("click", { button });
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/mouse") {
    const button = body.button === "right" ? "right" : "left";
    const kind = body.kind === "up" ? "up" : "down";
    await helper.send("mouse", { button, kind });
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/mouse/release-all") {
    await releaseAllMouseButtons();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/scroll") {
    const amount = normalizeNumber(body.amount, -1200, 1200);
    helper.enqueueScroll(amount);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/key") {
    const key = normalizeKeyCombo(body.key);
    if (!isAllowedKeyCombo(key)) {
      sendJson(res, 400, { ok: false, error: "key not allowed" });
      return;
    }
    await helper.send("key", { key });
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/type") {
    const text = String(body.text || "").slice(0, 500);
    await helper.send("type", { text });
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/clipboard/set") {
    const text = String(body.text || "").slice(0, MAX_CLIPBOARD_TEXT_LENGTH);
    await helper.send("clipboard-set", { text });
    sendJson(res, 200, { ok: true, characters: text.length });
    return;
  }

  if (pathname === "/api/clipboard/get") {
    const text = String((await helper.send("clipboard-get"))?.text || "").slice(0, MAX_CLIPBOARD_TEXT_LENGTH);
    sendJson(res, 200, { ok: true, text, characters: text.length });
    return;
  }

  if (pathname === "/api/files/drop") {
    try {
      const files = saveDroppedFiles(body.files);
      sendJson(res, 200, { ok: true, files, directory: "data/dropbox" });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || "invalid file upload" });
    }
    return;
  }

  if (pathname === "/api/open-link") {
    const text = normalizeOpenText(body.text);
    if (!text) {
      sendJson(res, 400, { ok: false, error: "link is required" });
      return;
    }
    await helper.send("key", { key: "ctrl+l" });
    await helper.send("type", { text });
    await helper.send("key", { key: "enter" });
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/search") {
    const text = String(body.text || "").slice(0, 300);
    await helper.send("key", { key: "ctrl+l" });
    await helper.send("type", { text });
    await helper.send("key", { key: "enter" });
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { ok: false, error: "unknown endpoint" });
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const decoded = decodeURIComponent(safePath);
  const filePath = path.resolve(publicDir, `.${decoded}`);
  if (!isPathInside(publicDir, filePath)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, {
      "content-type": contentType,
      "cache-control": "no-store"
    });
    res.end(data);
  });
}

function openLocalUrl(url) {
  if (process.env.DESKCTL_NO_OPEN === "1") return;
  const child = spawn("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    "Start-Process -FilePath $args[0]",
    url
  ], {
    stdio: "ignore",
    windowsHide: true,
    detached: true
  });
  child.on("error", () => {});
  child.unref();
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    sendJson(res, status, { ok: false, error: error.message || "server error" });
  }
});

server.on("error", (error) => {
  console.error(`Desktop Phone Control failed to start: ${error.message}`);
  helper.child?.kill();
  process.exitCode = 1;
});

server.on("connection", (socket) => {
  socket.setNoDelay(true);
});

server.listen(port, host, () => {
  const urls = getLanUrls();
  const setupUrl = `http://127.0.0.1:${port}/setup.html?token=${setupKey}`;
  console.log("");
  console.log("Desktop Phone Control");
  console.log("=====================");
  console.log(`Pairing code: ${pairCode}`);
  console.log("");
  console.log("Connect dashboard:");
  console.log(`  ${setupUrl}`);
  console.log("");
  console.log("Open one of these on your phone:");
  for (const url of urls) console.log(`  ${url}`);
  console.log("");
  console.log("To edit phone shortcuts, open this on the laptop:");
  console.log(`  http://127.0.0.1:${port}/?admin=${adminKey}`);
  console.log("");
  console.log("To stream your screen, open this on the laptop:");
  console.log(`  http://127.0.0.1:${port}/sender.html?token=${streamKey}`);
  console.log("");
  console.log("Security: trusted local Wi-Fi only. Press Ctrl+C to stop.");
  console.log("");
  openLocalUrl(setupUrl);
});

let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  await releaseAllMouseButtons();
  helper.child?.kill();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
