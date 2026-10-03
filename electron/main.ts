import * as electron from 'electron';
import { app, BrowserWindow, ipcMain, dialog, protocol, Menu, safeStorage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as crypto from 'crypto';
import * as dgram from 'dgram';
import { Worker } from 'worker_threads';
import * as url from 'url';
import * as nodemailer from 'nodemailer';
import { MasterAuthService } from './master-security';
import { assertRendererSqlAllowlisted, mutationTable } from './sql-policy';
import { RENDERER_SQL_BY_ID } from './renderer-sql-allowlist';
import { applyRemoteGroups, type RemoteGroup } from '../src/bibliotecas/sync-operacoes';
import { installStructuredConsole } from '../src/bibliotecas/logger-estruturado';
import { LEDGER_PROTECTION_SQL } from '../src/bibliotecas/esquema-ledger';
import { decodeVerifiedBackup, writeVerifiedBackup } from './backup-storage';
import bcrypt from 'bcryptjs';
import { assertFinancialPermission, financialStatementTarget, userReadExposesSecrets, userStatementKind, userUpdateTouchesPrivileges, UserSessionService } from './user-security';
installStructuredConsole('tango-electron-main');
if (!app.isPackaged) {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";
}
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-gpu-rasterization");
app.commandLine.appendSwitch("disable-accelerated-2d-canvas");
app.commandLine.appendSwitch("disable-vulkan");
const disableRendererSandbox = process.env.TANGO_RENDERER_SANDBOX !== "true";
protocol.registerSchemesAsPrivileged([
  {
    scheme: "safe-file",
    privileges: {
      bypassCSP: false,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);
let mainWindow;
let server = null;
let iconPath;
let masterAuth: MasterAuthService | null = null;
const userAuth = new UserSessionService();
const userLoginAttempts = new Map<string, { failures: number; blockedUntil: number }>();
let financialSchemaBootstrapOpen = true;
let firstUserCreationReserved = false;
const isTangoMaster = process.argv.includes("--tango-master") || process.env.IS_TANGO_MASTER === "true";
const showDebugConsole = process.argv.includes("--debug-console") || process.env.TANGO_DEBUG_CONSOLE === "true";
const ERP_APP_NAME = "Tango Gestão de Creditos ERP";
const MASTER_APP_NAME = "TangoMasterGen";
const APP_DOWNLOAD_TITLE = ERP_APP_NAME;
const APP_DOWNLOAD_DIR_NAME = "TANGO GESTAO DE CREDITOS";
function configureAppIdentity() {
  if (isTangoMaster) return;
  const appDataDir = app.getPath("appData");
  const userDataCandidates = [
    ERP_APP_NAME,
    "Tango Gestão de Créditos ERP",
    "Tango Gestão e Créditos ERP",
    "TangoERP",
    "tango-gestao-e-creditos-erp",
    "tango-gestao-erp",
    "AngolaCreditoPro",
    "angola-credito-pro",
    "angola-crédito-pro",
    "angola-cr-dito-pro"
  ].map((name) => path.join(appDataDir, name));
  const hasAppData = (dir) => [
    "database.sqlite",
    "dev_database.sqlite",
    "license_activations.json",
    "db-worker.log"
  ].some((file) => fs.existsSync(path.join(dir, file)));
  const preferredDbName = app.isPackaged ? "database.sqlite" : "dev_database.sqlite";
  const dbNames = [preferredDbName, "database.sqlite", "dev_database.sqlite"];
  const getUserDataScore = (dir) => {
    if (!fs.existsSync(dir)) return 0;
    const databaseScores = dbNames.map((fileName, index) => {
      const filePath = path.join(dir, fileName);
      if (!fs.existsSync(filePath)) return 0;
      const mtime = fs.statSync(filePath).mtimeMs;
      const preference = index === 0 ? 2e12 : 1e12;
      return preference + mtime;
    }).filter((score) => score > 0);
    if (databaseScores.length > 0) return Math.max(...databaseScores);
    if (hasAppData(dir)) return 100;
    return 1;
  };
  const bestUserDataCandidate = userDataCandidates.map((dir) => ({ dir, score: getUserDataScore(dir) })).sort((a, b) => b.score - a.score)[0];
  const userDataPath = bestUserDataCandidate?.score > 0 ? bestUserDataCandidate.dir : path.join(appDataDir, ERP_APP_NAME);
  app.setName(ERP_APP_NAME);
  app.setPath("userData", userDataPath);
}
function getSubfolderForFile(fileName: string): string {
  const lower = String(fileName || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // 1. Recibos de Pagamento e Liquidação
  if (
    lower.startsWith("recibo") ||
    lower.includes("recibo") ||
    lower.includes("liquidacao") ||
    lower.includes("comprovativo")
  ) {
    return "Recibos";
  }

  // 2. Fichas de Clientes e Extratos Pessoais
  if (
    lower.startsWith("ficha") ||
    lower.includes("ficha_") ||
    lower.includes("extrato") ||
    lower.includes("perfil") ||
    (lower.includes("cliente") && !lower.includes("relatorio"))
  ) {
    return "Fichas de Clientes";
  }

  // 3. Contratos e Simulações
  if (
    lower.startsWith("contrato") ||
    lower.includes("contrato") ||
    lower.includes("promessa") ||
    lower.includes("simulacao") ||
    lower.includes("transferencia")
  ) {
    return "Contratos";
  }

  // 4. Cobrança e Contencioso
  if (
    lower.includes("cobranca") ||
    lower.includes("contencioso") ||
    lower.includes("notificacao") ||
    lower.includes("aviso") ||
    lower.includes("divida")
  ) {
    return "Cobrança";
  }

  // 5. Facturação e SAF-T Fiscal
  if (
    lower.startsWith("ft_") ||
    lower.startsWith("fr_") ||
    lower.startsWith("factura") ||
    lower.includes("saft") ||
    lower.includes("fiscal")
  ) {
    return "Facturação e Fiscal";
  }

  // 6. Backups da Base de Dados
  if (lower.startsWith("backup") || lower.includes("backup")) {
    return "Backups";
  }

  // 7. Relatórios Gerais, Financeiros e Analíticos
  return "Relatórios";
}

function getTangoDownloadDir(subfolder?: string) {
  const documentsDir = app.getPath("documents");
  const candidateFolderNames = [
    "TANGO GESTÃO DE CRÉDITOS",
    "TANGO GESTAO DE CREDITOS"
  ];

  let baseDir = path.join(documentsDir, candidateFolderNames[0]);
  for (const name of candidateFolderNames) {
    const existing = path.join(documentsDir, name);
    if (fs.existsSync(existing)) {
      baseDir = existing;
      break;
    }
  }

  const targetDir = subfolder ? path.join(baseDir, subfolder) : baseDir;
  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.accessSync(targetDir, fs.constants.W_OK);
    return targetDir;
  } catch (error) {
    console.warn("[Download] Pasta indisponivel para escrita:", targetDir, (error as any)?.message || error);
    const fallbackBase = app.getPath("downloads");
    const fallbackTarget = subfolder ? path.join(fallbackBase, subfolder) : fallbackBase;
    try {
      if (!fs.existsSync(fallbackTarget)) fs.mkdirSync(fallbackTarget, { recursive: true });
      return fallbackTarget;
    } catch {
      return fallbackBase;
    }
  }
}

function sanitizeDownloadFileName(fileName: string) {
  return String(fileName || `documento-${Date.now()}`).replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-").replace(/\s+/g, " ").trim();
}
const DISCOVERY_PORT = 3001;
let ACTIVATIONS_FILE;
function getActivationsPath() {
  if (!ACTIVATIONS_FILE) {
    ACTIVATIONS_FILE = path.join(app.getPath("userData"), "license_activations.json");
  }
  return ACTIVATIONS_FILE;
}
function getActivations() {
  try {
    const filePath = getActivationsPath();
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
  } catch (e) {
  }
  return {};
}
function saveActivation(licenseKey, machineId) {
  try {
    const activations = getActivations();
    const filePath = getActivationsPath();
    activations[licenseKey] = machineId;
    fs.writeFileSync(filePath, JSON.stringify(activations, null, 4));
  } catch (e) {
    console.error("[Licenciamento] Erro ao salvar ativação:", e);
  }
}
let discoverySocket = null;
let adInterval = null;
function startAdvertising(passkey) {
  if (discoverySocket) return;
  discoverySocket = dgram.createSocket({ type: "udp4", reuseAddr: true });
  discoverySocket.bind(() => {
    discoverySocket.setBroadcast(true);
    adInterval = setInterval(() => {
      const info = getLocalNetworkInfo();
      const message = JSON.stringify({
        type: "master-announce",
        name: info.hostname,
        ip: info.ip,
        pass: passkey ? "protected" : "open"
      });
      discoverySocket.send(message, 0, message.length, DISCOVERY_PORT, "255.255.255.255");
    }, 5e3);
  });
}
function stopDiscovery() {
  if (adInterval) clearInterval(adInterval);
  if (discoverySocket) {
    discoverySocket.close();
    discoverySocket = null;
  }
}
function startListening() {
  if (discoverySocket) return;
  discoverySocket = dgram.createSocket({ type: "udp4", reuseAddr: true });
  discoverySocket.on("message", (msg, rinfo) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === "master-announce" && mainWindow) {
        mainWindow.webContents.send("master-discovered", data);
      }
    } catch (e) {
    }
  });
  discoverySocket.bind(DISCOVERY_PORT);
}
function getLocalNetworkInfo() {
  const interfaces = os.networkInterfaces();
  let ips = [];
  const hostname = os.hostname();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  ips.sort((a, b) => {
    if (a.startsWith("192.168") || a.startsWith("10.")) return -1;
    if (b.startsWith("192.168") || b.startsWith("10.")) return 1;
    return 0;
  });
  if (ips.length === 0) ips.push("127.0.0.1");
  return { ip: ips[0], ips, hostname };
}
function removeMenuBar() {
  Menu.setApplicationMenu(null);
}
function installRendererDebugConsole(window, startUrl) {
  if (!showDebugConsole) return;
  const debugLines = [];
  let overlayInjected = false;
  const pushDebugLine = (level, message) => {
    const text = `[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] ${message}`;
    const entry = { level, text };
    debugLines.push(entry);
    if (debugLines.length > 200) debugLines.shift();
    const terminalMessage = `[Electron Debug] ${text}`;
    if (level === "error") console.error(terminalMessage);
    else if (level === "warning") console.warn(terminalMessage);
    else console.log(terminalMessage);
    if (!overlayInjected || window.webContents.isDestroyed()) return;
    window.webContents.executeJavaScript(
      `window.__tangoElectronDebug && window.__tangoElectronDebug.add(${JSON.stringify(entry)});`,
      true
    ).catch(() => {
    });
  };
  const injectOverlay = () => {
    if (window.webContents.isDestroyed()) return;
    const script = `
(() => {
  const initialLines = ${JSON.stringify(debugLines)};
  const oldConsole = document.getElementById('tango-electron-debug-console');
  if (oldConsole) oldConsole.remove();

  const root = document.createElement('section');
  root.id = 'tango-electron-debug-console';
  root.style.cssText = [
    'position:fixed',
    'left:12px',
    'right:12px',
    'bottom:12px',
    'z-index:2147483647',
    'max-height:42vh',
    'background:rgba(8,10,16,.96)',
    'color:#f8fafc',
    'font:12px Consolas,Monaco,monospace',
    'border:1px solid rgba(148,163,184,.75)',
    'box-shadow:0 16px 50px rgba(0,0,0,.35)',
    'border-radius:6px',
    'overflow:hidden'
  ].join(';');

  const header = document.createElement('div');
  header.style.cssText = [
    'display:flex',
    'align-items:center',
    'justify-content:space-between',
    'gap:8px',
    'padding:8px 10px',
    'background:#111827',
    'border-bottom:1px solid rgba(148,163,184,.35)',
    'font-weight:700'
  ].join(';');
  header.textContent = 'Electron Console';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = 'X';
  closeButton.title = 'Fechar console';
  closeButton.style.cssText = [
    'width:24px',
    'height:24px',
    'border:1px solid rgba(148,163,184,.7)',
    'background:#1f2937',
    'color:#f8fafc',
    'cursor:pointer'
  ].join(';');
  closeButton.addEventListener('click', () => root.remove());
  header.appendChild(closeButton);

  const body = document.createElement('div');
  body.style.cssText = [
    'max-height:34vh',
    'overflow:auto',
    'padding:8px 10px',
    'white-space:pre-wrap',
    'line-height:1.45'
  ].join(';');

  root.appendChild(header);
  root.appendChild(body);
  document.documentElement.appendChild(root);

  const colors = {
    info: '#bfdbfe',
    warning: '#fde68a',
    error: '#fecaca'
  };

  window.__tangoElectronDebug = {
    add(entry) {
      const row = document.createElement('div');
      row.textContent = entry.text;
      row.style.color = colors[entry.level] || colors.info;
      body.appendChild(row);
      body.scrollTop = body.scrollHeight;
    }
  };

  initialLines.forEach((entry) => window.__tangoElectronDebug.add(entry));

  if (!window.__tangoElectronDebugListenersInstalled) {
    window.__tangoElectronDebugListenersInstalled = true;
    window.addEventListener('error', (event) => {
      window.__tangoElectronDebug.add({
        level: 'error',
        text: '[renderer error] ' + event.message + ' ' + event.filename + ':' + event.lineno + ':' + event.colno
      });
    });
    window.addEventListener('unhandledrejection', (event) => {
      window.__tangoElectronDebug.add({
        level: 'error',
        text: '[unhandled rejection] ' + String(event.reason && (event.reason.stack || event.reason.message || event.reason))
      });
    });
  }
})();
`;
    window.webContents.executeJavaScript(script, true).then(() => {
      overlayInjected = true;
      pushDebugLine("info", "Console visual injetado na janela.");
    }).catch((error) => {
      overlayInjected = false;
      pushDebugLine("error", `Falha ao injetar console visual: ${error.message}`);
    });
  };
  const inspectDom = () => {
    if (window.webContents.isDestroyed()) return;
    window.webContents.executeJavaScript(`
(() => {
  const root = document.getElementById('root');
  return {
    href: location.href,
    title: document.title,
    readyState: document.readyState,
    bodyChildren: document.body ? document.body.children.length : 0,
    rootFound: Boolean(root),
    rootChildren: root ? root.children.length : null,
    rootText: root ? (root.textContent || '').slice(0, 180) : null
  };
})();
`, true).then((info) => pushDebugLine("info", `DOM: ${JSON.stringify(info)}`)).catch((error) => pushDebugLine("error", `Falha ao inspecionar DOM: ${error.message}`));
  };
  pushDebugLine("info", `Debug console ativo. URL inicial: ${startUrl}`);
  pushDebugLine("info", `Renderer sandbox: ${disableRendererSandbox ? "desativado" : "ativo"}`);
  window.webContents.on("did-start-loading", () => {
    overlayInjected = false;
    pushDebugLine("info", "did-start-loading");
  });
  window.webContents.on("dom-ready", () => {
    pushDebugLine("info", `dom-ready: ${window.webContents.getURL()}`);
    injectOverlay();
    inspectDom();
  });
  window.webContents.on("did-finish-load", () => {
    pushDebugLine("info", `did-finish-load: ${window.webContents.getURL()}`);
    inspectDom();
    setTimeout(inspectDom, 3000);
  });
  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    pushDebugLine("error", `did-fail-load ${errorCode} ${errorDescription} ${validatedURL} mainFrame=${isMainFrame}`);
    injectOverlay();
  });
  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const mappedLevel = level >= 3 ? "error" : level >= 2 ? "warning" : "info";
    pushDebugLine(mappedLevel, `renderer console: ${message} (${sourceId}:${line})`);
  });
  window.webContents.on("preload-error", (_event, preloadPath, error) => {
    pushDebugLine("error", `preload-error ${preloadPath}: ${error.message}`);
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    pushDebugLine("error", `render-process-gone reason=${details.reason} exitCode=${details.exitCode}`);
  });
  window.on("unresponsive", () => {
    pushDebugLine("warning", "A janela ficou sem resposta.");
  });
  setTimeout(() => {
    if (!window.isDestroyed()) {
      window.webContents.openDevTools({ mode: "right" });
      pushDebugLine("info", "DevTools aberto no lado direito.");
    }
  }, 800);
}
function createWindow() {
  const primaryDisplay = electron.screen.getPrimaryDisplay();
  const { x, y, width, height } = primaryDisplay.workArea;
  const minimumWindowSize = { width: 800, height: 600 };
  const iconPaths = [
    path.join(app.getAppPath(), "dist", "icon.ico"),
    path.join(app.getAppPath(), "build", "icon.ico"),
    path.join(app.getAppPath(), "public", "icon.ico"),
    path.join(process.resourcesPath, "icon.ico"),
    path.join(process.resourcesPath, "build", "icon.ico"),
    path.join(process.resourcesPath, "app.asar.unpacked", "build", "icon.ico")
  ];
  iconPath = iconPaths.find((p) => fs.existsSync(p));
  mainWindow = new BrowserWindow({
    title: isTangoMaster ? MASTER_APP_NAME : ERP_APP_NAME,
    x,
    y,
    width,
    height,
    minWidth: minimumWindowSize.width,
    minHeight: minimumWindowSize.height,
    show: false,
    backgroundColor: "#020617",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      // Habilitar segurança web
      sandbox: !disableRendererSandbox,
      plugins: false
      // Habilitar plugins (Necessário para PDF Viewer)
    },
    icon: process.platform === "darwin" ? void 0 : iconPath
  });
  const masterSenderId = mainWindow.webContents.id;
  mainWindow.webContents.once("destroyed", () => masterAuth?.revokeSender(masterSenderId));
  mainWindow.webContents.on("render-process-gone", () => masterAuth?.revokeSender(masterSenderId));
  mainWindow.webContents.once("destroyed", () => userAuth.revokeSender(masterSenderId));
  mainWindow.webContents.on("render-process-gone", () => userAuth.revokeSender(masterSenderId));
  mainWindow.webContents.setWindowOpenHandler(({ url: url2 }) => {
    if (url2.startsWith("https:") || url2.startsWith("mailto:")) {
      const { shell } = require("electron");
      shell.openExternal(url2);
      return { action: "deny" };
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url2) => {
    const parsedUrl = new URL(url2);
    const isSelf = parsedUrl.origin === "http://localhost:8081" || parsedUrl.origin === "http://localhost:3000" || parsedUrl.protocol === "file:";
    if (!isSelf) {
      event.preventDefault();
      const { shell } = require("electron");
      shell.openExternal(url2);
    }
  });
  electron.session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowedPermissions = ["notifications"];
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });
  electron.session.defaultSession.removeAllListeners("will-download");
  electron.session.defaultSession.on("will-download", (_event, item) => {
    const rawFileName = item.getFilename();
    const fileName = sanitizeDownloadFileName(rawFileName);
    const subfolder = getSubfolderForFile(fileName);
    const targetDir = getTangoDownloadDir(subfolder);
    const defaultPath = path.join(targetDir, fileName);
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus();
      }
      item.setSaveDialogOptions({
        title: `${APP_DOWNLOAD_TITLE} - Guardar em ${subfolder}`,
        defaultPath,
        buttonLabel: "Guardar"
      });
    } catch (error) {
      console.warn("[Download] Nao foi possivel configurar a janela de guardar:", error);
    }
  });
  const isDev = !app.isPackaged;
  const erpPath = path.join(__dirname, "../dist/index.html");
  const masterPath = path.join(__dirname, "../dist-admin/index-admin.html");
  const startUrl = isDev ? isTangoMaster ? "http://localhost:8082/index-admin.html" : "http://localhost:8081" : `file://${isTangoMaster ? masterPath : erpPath}`;
  installRendererDebugConsole(mainWindow, startUrl);
  if (isTangoMaster) {
    if (isDev) {
      mainWindow.loadURL(startUrl);
    } else {
      mainWindow.loadFile(masterPath);
    }
  } else {
    if (isDev) {
      mainWindow.loadURL(startUrl);
    } else {
      mainWindow.loadFile(erpPath);
    }
  }
  mainWindow.maximize();
  mainWindow.show();
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
let connectedClients = /* @__PURE__ */ new Map();
let sseClients = [];
let currentSyncPasskey = null;
let cachedConfig = null;
const requestCounts = /* @__PURE__ */ new Map();
const RATE_LIMIT_WINDOW = 6e4;
const MAX_REQUESTS = 200;
const MAX_SYNC_BODY_BYTES = 5 * 1024 * 1024;
const MAX_LICENSE_BODY_BYTES = 32 * 1024;
const SAFE_FILE_EXTENSIONS = /* @__PURE__ */ new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf"]);
const isAllowedCorsOrigin = (origin) => {
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname;
    return parsed.protocol === "http:" && (host === "localhost" || host === "127.0.0.1" || host.startsWith("192.168.") || host.startsWith("10.") || /^172\.(1[6-9]|2\d|3[01])\./.test(host));
  } catch (e) {
    return false;
  }
};
const constantTimeEquals = (expected, received) => {
  if (!expected) return false;
  const receivedValue = Array.isArray(received) ? received[0] : received;
  if (!receivedValue) return false;
  const expectedBuffer = Buffer.from(String(expected));
  const receivedBuffer = Buffer.from(String(receivedValue));
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};
const setServerSecurityHeaders = (res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
};
const isPathInside = (targetPath, basePath) => {
  const resolvedTarget = path.resolve(targetPath).toLowerCase();
  const resolvedBase = path.resolve(basePath).toLowerCase();
  return resolvedTarget === resolvedBase || resolvedTarget.startsWith(resolvedBase + path.sep);
};
const isAllowedSafeFilePath = (filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  if (!SAFE_FILE_EXTENSIONS.has(extension)) return false;
  const allowedRoots = [
    app.getPath("userData"),
    app.getPath("documents"),
    app.getPath("temp"),
    app.getAppPath(),
    process.resourcesPath
  ].filter(Boolean);
  return allowedRoots.some((root) => isPathInside(filePath, root));
};
const MAX_SQL_LENGTH = 2e5;
const MAX_SQL_STATEMENTS = 100;
const MAX_TRANSACTION_STATEMENTS = 1e3;
const MAX_PARAM_COUNT = 500;
const MAX_STRING_PARAM_LENGTH = 1e6;
const MAX_IMPORT_BYTES = 512 * 1024 * 1024;
const FORBIDDEN_SQL_PATTERN = /\b(ATTACH|DETACH|LOAD_EXTENSION)\b|\bPRAGMA\s+(key|rekey|hexkey|textkey|cipher|cipher_|legacy)\b/i;
const READ_KEYWORDS = /* @__PURE__ */ new Set(["SELECT", "WITH", "PRAGMA"]);
const WRITE_KEYWORDS = /* @__PURE__ */ new Set(["INSERT", "UPDATE", "DELETE", "REPLACE", "CREATE", "ALTER", "DROP", "VACUUM", "REINDEX", "ANALYZE", "PRAGMA"]);
const EXEC_KEYWORDS = /* @__PURE__ */ new Set([...READ_KEYWORDS, ...WRITE_KEYWORDS]);
const ALLOWED_READ_PRAGMAS = /* @__PURE__ */ new Set([
  "table_info",
  "table_xinfo",
  "index_list",
  "index_info",
  "index_xinfo",
  "foreign_key_list",
  "integrity_check",
  "quick_check",
  "database_list",
  "user_version"
]);
const ALLOWED_WRITE_PRAGMAS = /* @__PURE__ */ new Set(["optimize", "wal_checkpoint", "user_version"]);
const stripSqlComments = (sql) => sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
const isApprovedLedgerTrigger = (sql: string) => {
  const normalized = stripSqlComments(sql).replace(/\s+/g, " ").trim();
  return LEDGER_PROTECTION_SQL.some(allowed => allowed.replace(/\s+/g, " ").trim() === normalized);
};
function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let quote = null;
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const next = sql[i + 1];
    current += char;
    if (quote) {
      if (quote === "'" && char === "'" && next === "'") {
        current += next;
        i++;
        continue;
      }
      if (quote === '"' && char === '"' || quote === "'" && char === "'" || quote === "`" && char === "`" || quote === "]" && char === "]") {
        quote = null;
      }
      continue;
    }
    if (char === "-" && next === "-") {
      while (i + 1 < sql.length && sql[i + 1] !== "\n") {
        current += sql[++i];
      }
      continue;
    }
    if (char === "/" && next === "*") {
      current += next;
      i++;
      while (i + 1 < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) {
        current += sql[++i];
      }
      if (i + 1 < sql.length) {
        current += sql[++i];
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "[") {
      quote = "]";
      continue;
    }
    if (char === ";") {
      const statement = current.slice(0, -1).trim();
      if (statement) statements.push(statement);
      current = "";
    }
  }
  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}
const getSqlKeyword = (statement) => {
  const match = stripSqlComments(statement).match(/^([a-z_]+)/i);
  return (match?.[1] || "").toUpperCase();
};
const getPragmaName = (statement) => {
  const match = stripSqlComments(statement).match(/^PRAGMA\s+(?:main\.)?([a-z_][\w]*)/i);
  return (match?.[1] || "").toLowerCase();
};
const isSafeReadStatement = (statement) => {
  const keyword = getSqlKeyword(statement);
  if (!READ_KEYWORDS.has(keyword)) return false;
  if (keyword === "PRAGMA") return ALLOWED_READ_PRAGMAS.has(getPragmaName(statement));
  if (keyword === "WITH") {
    return !/\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|VACUUM|REINDEX|ANALYZE|PRAGMA)\b/i.test(stripSqlComments(statement));
  }
  return true;
};
const isAllowedWriteStatement = (statement) => {
  const cleaned = stripSqlComments(statement);
  const keyword = getSqlKeyword(cleaned);
  if (!WRITE_KEYWORDS.has(keyword)) return false;
  if (keyword === "PRAGMA") {
    const pragmaName = getPragmaName(cleaned);
    return ALLOWED_READ_PRAGMAS.has(pragmaName) || ALLOWED_WRITE_PRAGMAS.has(pragmaName);
  }
  if (keyword === "CREATE") {
    return /^CREATE\s+(UNIQUE\s+)?(TABLE|INDEX)\b/i.test(cleaned) || isApprovedLedgerTrigger(cleaned);
  }
  if (keyword === "DROP") {
    if (/^DROP\s+TABLE\s+(IF\s+EXISTS\s+)?(?:"|'|`|\[)?[a-z0-9_]+_old(?:"|'|`|\])?\s*$/i.test(cleaned)) return true;
    if (/^DROP\s+INDEX\s+IF\s+EXISTS\s+/i.test(cleaned)) return true;
    return false;
  }
  if (keyword === "DELETE" && /\bFROM\s+sqlite_(master|schema)\b/i.test(cleaned)) {
    return false;
  }
  return true;
};
const sanitizeSql = (sql) => {
  if (typeof sql !== "string") throw new TypeError("SQL invalido.");
  const normalized = sql.trim();
  if (!normalized) throw new Error("SQL vazio.");
  if (normalized.length > MAX_SQL_LENGTH) throw new Error("SQL demasiado grande.");
  if (FORBIDDEN_SQL_PATTERN.test(normalized)) throw new Error("Instrucao SQLite bloqueada.");
  return normalized;
};
const sanitizeSqlParams = (params = []) => {
  if (params == null) return [];
  if (!Array.isArray(params)) throw new TypeError("Parametros SQL devem ser array.");
  if (params.length > MAX_PARAM_COUNT) throw new Error("Demasiados parametros SQL.");
  return params.map((value) => {
    if (value === void 0) return null;
    if (value === null || typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (value.length > MAX_STRING_PARAM_LENGTH) throw new Error("Parametro SQL textual demasiado grande.");
      return value;
    }
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    if (value instanceof ArrayBuffer) return Buffer.from(value);
    throw new TypeError("Parametro SQL nao suportado.");
  });
};
const validateSqlRequest = (type, sql, params = []) => {
  const normalizedSql = sanitizeSql(sql);
  const statements = isApprovedLedgerTrigger(normalizedSql) ? [normalizedSql] : splitSqlStatements(normalizedSql);
  if (statements.length === 0) throw new Error("SQL vazio.");
  if (type !== "exec" && statements.length !== 1) throw new Error("Use transacoes para multiplas instrucoes SQL.");
  if (statements.length > MAX_SQL_STATEMENTS) throw new Error("SQL contem demasiadas instrucoes.");
  for (const statement of statements) {
    const keyword = getSqlKeyword(statement);
    if (type === "query" || type === "get") {
      if (!isSafeReadStatement(statement)) throw new Error("Leituras aceitam apenas SELECT, WITH seguro ou PRAGMA de leitura.");
    } else if (type === "execute") {
      if (!isAllowedWriteStatement(statement)) throw new Error(`Instrucao ${keyword || "SQL"} nao permitida em escrita.`);
    } else if (!EXEC_KEYWORDS.has(keyword) || !isSafeReadStatement(statement) && !isAllowedWriteStatement(statement)) {
      throw new Error(`Instrucao ${keyword || "SQL"} nao permitida em execucao.`);
    }
  }
  return {
    sql: normalizedSql,
    params: sanitizeSqlParams(params)
  };
};
const validateDbTransaction = (statements) => {
  if (!Array.isArray(statements)) throw new TypeError("Transacao invalida.");
  if (statements.length === 0) throw new Error("Transacao vazia.");
  if (statements.length > MAX_TRANSACTION_STATEMENTS) throw new Error("Transacao com demasiadas instrucoes.");
  return statements.map((statement) => {
    if (!statement || typeof statement !== "object") throw new TypeError("Instrucao de transacao invalida.");
    const item = statement;
    const type = item.type === "exec" ? "exec" : "execute";
    if (item.expectChanges !== void 0 && (!Number.isSafeInteger(item.expectChanges) || item.expectChanges < 0 || item.expectChanges > 1e6)) {
      throw new Error("Contagem esperada de alteracoes invalida.");
    }
    const validated = validateSqlRequest(type, item.sql, item.params);
    return { ...validated, type, expectChanges: item.expectChanges };
  });
};
const isTrustedRendererUrl = (urlValue) => {
  try {
    const parsed = new URL(urlValue);
    if (parsed.protocol === "file:") return true;
    if (parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
      return ["8081", "8082", "3000"].includes(parsed.port);
    }
  } catch {
    return false;
  }
  return false;
};
const assertTrustedIpcSender = (event) => {
  if (mainWindow && event.sender !== mainWindow.webContents) {
    throw new Error("Pedido IPC rejeitado: janela nao autorizada.");
  }
  const frameUrl = event.senderFrame?.url || event.sender.getURL();
  if (!isTrustedRendererUrl(frameUrl)) {
    throw new Error("Pedido IPC rejeitado: origem nao autorizada.");
  }
};
const assertFinancialSqlAuthorized = (event: Electron.IpcMainInvokeEvent, statements: Array<{ sql: string }>) => {
  for (const statement of statements) {
    const table = financialStatementTarget(statement.sql, financialSchemaBootstrapOpen);
    if (!table) continue;
    const user: any = userAuth.assertAuthenticated(event.sender.id);
    assertFinancialPermission(user, table);
  }
};
const hasManageUsers = (user: any) => ['super_admin', 'admin'].includes(String(user?.role)) ||
  (Array.isArray(user?.permissions) && user.permissions.includes('manage_users'));
const hasPermission = (user: any, permission: string) => ['super_admin', 'admin'].includes(String(user?.role)) ||
  (Array.isArray(user?.permissions) && user.permissions.includes(permission));
const assertUserPermission = (event: Electron.IpcMainInvokeEvent, permission?: string) => {
  const currentUser: any = userAuth.assertAuthenticated(event.sender.id);
  if (permission && !hasPermission(currentUser, permission)) throw new Error(`Sem permissao: ${permission}.`);
  return currentUser;
};
const TABLE_WRITE_PERMISSIONS: Record<string, string> = {
  clients: "manage_clients",
  company_settings: "manage_settings",
  user_limits: "manage_limits",
  payment_gateways: "manage_settings",
  payment_references: "manage_payments",
  closed_months: "manage_fiscal",
  message_templates: "manage_settings",
  sync_conflicts: "manage_credits"
};
const assertGenericSqlAuthorized = (event: Electron.IpcMainInvokeEvent, statements: Array<{ sql: string }>) => {
  if (financialSchemaBootstrapOpen) return;
  for (const statement of statements) {
    const table = mutationTable(statement.sql);
    if (!table || ["credits", "payments", "accounting_entries", "ledger_transactions", "ledger_lines", "credit_installments", "users"].includes(table)) continue;
    assertUserPermission(event, TABLE_WRITE_PERMISSIONS[table]);
  }
};
const normalizeImportBuffer = (data) => {
  let buffer;
  if (Buffer.isBuffer(data)) buffer = data;
  else if (data instanceof Uint8Array) buffer = Buffer.from(data);
  else if (data instanceof ArrayBuffer) buffer = Buffer.from(data);
  else if (Array.isArray(data) && data.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)) buffer = Buffer.from(data);
  else throw new TypeError("Backup invalido.");
  if (buffer.length === 0) throw new Error("Backup vazio.");
  if (buffer.length > MAX_IMPORT_BYTES) throw new Error("Backup demasiado grande.");
  return buffer;
};
const broadcastToClients = (type, data) => {
  const message = `data: ${JSON.stringify({ type, data })}

`;
  sseClients = sseClients.filter((client) => {
    try {
      client.res.write(message);
      return true;
    } catch (e) {
      return false;
    }
  });
  if (mainWindow) mainWindow.webContents.send("db-update", data);
};
const startServerInternal = async (passkey) => {
  if (server) return { success: true, message: "Servidor já se encontra em execução." };
  currentSyncPasskey = passkey || null;
  startAdvertising(passkey);
  return new Promise((resolve) => {
    const PORT = 3e3;
    server = http.createServer((req, res) => {
      setServerSecurityHeaders(res);
      const requestOrigin = req.headers.origin;
      if (!isAllowedCorsOrigin(requestOrigin)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Origem nao autorizada." }));
        return;
      }
      if (requestOrigin) {
        res.setHeader("Access-Control-Allow-Origin", requestOrigin);
        res.setHeader("Vary", "Origin");
      }
      res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-sync-passkey, x-client-name");
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      const clientIp = req.socket.remoteAddress?.replace("::ffff:", "") || "desconhecido";
      const now = Date.now();
      const rateData = requestCounts.get(clientIp);
      if (rateData && now < rateData.resetAt) {
        rateData.count++;
        if (rateData.count > MAX_REQUESTS) {
          res.writeHead(429, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Muitos pedidos. Por favor, aguarde um minuto." }));
          return;
        }
      } else {
        requestCounts.set(clientIp, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
      }
      const url2 = new URL(req.url || "", `http://${req.headers.host}`);
      const pathname = url2.pathname;
      if (pathname === "/events" || pathname === "/events/") {
        const clientPasskey = req.headers["x-sync-passkey"] || url2.searchParams.get("access_token");
        if (!constantTimeEquals(currentSyncPasskey, clientPasskey)) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, message: "Chave invalida." }));
          return;
        }
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          ...requestOrigin ? { "Access-Control-Allow-Origin": requestOrigin } : {}
        });
        res.write(": keep-alive\n\n");
        const client = { res, ip: clientIp };
        sseClients.push(client);
        req.on("close", () => {
          sseClients = sseClients.filter((c) => c !== client);
        });
        return;
      }
      if (req.method === "GET" && (pathname === "/fetch-config" || pathname === "/fetch-config/")) {
        const clientPasskey = req.headers["x-sync-passkey"];
        if (!constantTimeEquals(currentSyncPasskey, clientPasskey)) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, message: "Chave inválida." }));
          return;
        }
        if (cachedConfig) {
          if (clientIp !== "desconhecido") {
            const hostname = req.headers["x-client-name"] || "Dispositivo Remoto";
            connectedClients.set(clientIp, {
              ip: clientIp,
              hostname,
              userAgent: req.headers["user-agent"],
              connectTime: (/* @__PURE__ */ new Date()).toISOString(),
              lastSeen: (/* @__PURE__ */ new Date()).toISOString(),
              status: "online",
              platform: "app"
            });
            if (mainWindow) mainWindow.webContents.send("clients-updated", Array.from(connectedClients.values()));
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, ...cachedConfig }));
        } else {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, message: "Configuração não disponível." }));
        }
        return;
      }
      if (req.method === "POST" && (pathname === "/sync" || pathname === "/sync/")) {
        const clientPasskey = req.headers["x-sync-passkey"];
        if (!constantTimeEquals(currentSyncPasskey, clientPasskey)) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, message: "Chave inválida." }));
          return;
        }
        if (clientIp !== "desconhecido") {
          const existing = connectedClients.get(clientIp);
          const hostname = req.headers["x-client-name"] || existing?.hostname || "Dispositivo Remoto";
          connectedClients.set(clientIp, {
            ip: clientIp,
            hostname,
            userAgent: req.headers["user-agent"],
            connectTime: existing?.connectTime || (/* @__PURE__ */ new Date()).toISOString(),
            lastSeen: (/* @__PURE__ */ new Date()).toISOString(),
            status: "online",
            platform: "app"
          });
          if (mainWindow) mainWindow.webContents.send("clients-updated", Array.from(connectedClients.values()));
        }
        let body = "";
        let bodyTooLarge = false;
        req.on("data", (chunk) => {
          body += chunk.toString();
          if (Buffer.byteLength(body, "utf8") > MAX_SYNC_BODY_BYTES) {
            bodyTooLarge = true;
            res.writeHead(413, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, message: "Pedido demasiado grande." }));
            req.destroy();
          }
        });
        req.on("end", () => {
          if (bodyTooLarge) return;
          try {
            if (!body) throw new Error("Body empty");
            if (mainWindow) {
              mainWindow.webContents.send("sync-received", body);
              broadcastToClients("db-update", { source: clientIp, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: true }));
            } else {
              throw new Error("Window closed");
            }
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, message: e.message }));
          }
        });
        return;
      }
      if (req.method === "POST" && (pathname === "/api/license/activate" || pathname === "/api/license/activate/")) {
        let body = "";
        let bodyTooLarge = false;
        req.on("data", (chunk) => {
          body += chunk.toString();
          if (Buffer.byteLength(body, "utf8") > MAX_LICENSE_BODY_BYTES) {
            bodyTooLarge = true;
            res.writeHead(413, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, message: "Pedido demasiado grande." }));
            req.destroy();
          }
        });
        req.on("end", () => {
          if (bodyTooLarge) return;
          try {
            const { licenseKey, machineId } = JSON.parse(body);
            if (!licenseKey || !machineId) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, message: "Dados incompletos." }));
              return;
            }
            const activations = getActivations();
            const cleanKey = String(licenseKey).trim();
            if (activations[cleanKey] && activations[cleanKey] !== machineId) {
              res.writeHead(403, { "Content-Type": "application/json" });
              res.end(JSON.stringify({
                success: false,
                message: "Licença já utilizada por favor adquira outra",
                code: "LICENSE_ALREADY_USED"
              }));
              return;
            }
            if (!activations[cleanKey]) {
              saveActivation(cleanKey, machineId);
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, message: "Licença validada/ativada." }));
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, message: "Erro ao processar ativação." }));
          }
        });
        return;
      }
      let safePath = pathname === "" || pathname === "/" ? "/index.html" : pathname;
      let decodedPath = "/index.html";
      try {
        decodedPath = decodeURIComponent(safePath);
      } catch (e) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Bad Request");
        return;
      }
      const distRoot = path.resolve(__dirname, "../dist");
      let filePath = path.resolve(distRoot, `.${decodedPath}`);
      if (!filePath.startsWith(distRoot + path.sep) && filePath !== distRoot) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden");
        return;
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distRoot, "index.html");
      }
      const extname = String(path.extname(filePath)).toLowerCase();
      const mimeTypes = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".wav": "audio/wav",
        ".mp4": "video/mp4",
        ".woff": "application/font-woff",
        ".ttf": "application/font-ttf",
        ".eot": "application/vnd.ms-fontobject",
        ".otf": "application/font-otf",
        ".wasm": "application/wasm"
      };
      const contentType = mimeTypes[extname] || "application/octet-stream";
      fs.readFile(filePath, (error, content) => {
        if (error) {
          res.writeHead(error.code == "ENOENT" ? 404 : 500);
          res.end(error.code == "ENOENT" ? "File not found" : "Internal Server Error");
        } else {
          res.writeHead(200, { "Content-Type": contentType });
          res.end(content, "utf-8");
        }
      });
    });
    server.listen(PORT, "0.0.0.0", () => {
      resolve({ success: true, ...getLocalNetworkInfo(), port: PORT });
    });
    server.on("error", (e) => {
      server = null;
      resolve({ success: false, message: e.message });
    });
  });
};
function registerMainHandlers() {
  const assertMasterSession = (event: Electron.IpcMainInvokeEvent) => {
    assertTrustedIpcSender(event);
    if (!isTangoMaster || !masterAuth) throw new Error("Recurso disponivel apenas no Tango Master.");
    masterAuth.assertAuthenticated(event.sender.id);
  };
  const licenseVaultPath = () => path.join(app.getPath("userData"), "license-signing-key.bin");
  const readLicensePrivateKey = () => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Armazenamento seguro indisponivel.");
    const vaultPath = licenseVaultPath();
    if (!fs.existsSync(vaultPath)) throw new Error("Nenhuma chave privada de assinatura foi configurada.");
    return safeStorage.decryptString(fs.readFileSync(vaultPath));
  };
  const saveLicensePrivateKey = (privateKey: string) => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Armazenamento seguro indisponivel.");
    const normalized = crypto.createPrivateKey(privateKey).export({ type: "pkcs8", format: "pem" }).toString();
    const encrypted = safeStorage.encryptString(normalized);
    fs.writeFileSync(licenseVaultPath(), encrypted, { mode: 0o600 });
    return normalized;
  };
  ipcMain.handle("master-auth-status", async (event) => {
    assertTrustedIpcSender(event);
    if (!isTangoMaster || !masterAuth) return { configured: false, authenticated: false, unavailable: true, expiresAt: null };
    return masterAuth.status(event.sender.id);
  });
  ipcMain.handle("master-auth-setup", async (event, password) => {
    assertTrustedIpcSender(event);
    if (!isTangoMaster || !masterAuth) throw new Error("Configuracao disponivel apenas no Tango Master.");
    return masterAuth.setup(event.sender.id, password);
  });
  ipcMain.handle("master-auth-login", async (event, password) => {
    assertTrustedIpcSender(event);
    if (!isTangoMaster || !masterAuth) throw new Error("Autenticacao disponivel apenas no Tango Master.");
    return masterAuth.login(event.sender.id, password);
  });
  ipcMain.handle("master-auth-mfa-begin", async (event) => {
    assertTrustedIpcSender(event);
    if (!isTangoMaster || !masterAuth) throw new Error("Configuracao disponivel apenas no Tango Master.");
    return masterAuth.beginMfaEnrollment(event.sender.id);
  });
  ipcMain.handle("master-auth-mfa-confirm", async (event, token) => {
    assertTrustedIpcSender(event);
    if (!isTangoMaster || !masterAuth) throw new Error("Configuracao disponivel apenas no Tango Master.");
    return masterAuth.confirmMfaEnrollment(event.sender.id, token);
  });
  ipcMain.handle("master-auth-mfa-verify", async (event, token) => {
    assertTrustedIpcSender(event);
    if (!isTangoMaster || !masterAuth) throw new Error("Autenticacao disponivel apenas no Tango Master.");
    return masterAuth.verifyMfa(event.sender.id, token);
  });
  ipcMain.handle("master-auth-change-password", async (event, { currentPassword, newPassword }) => {
    assertMasterSession(event);
    return masterAuth!.changePassword(event.sender.id, currentPassword, newPassword);
  });
  ipcMain.handle("master-profile-get", async (event) => {
    assertMasterSession(event);
    return masterAuth!.getProfile(event.sender.id);
  });
  ipcMain.handle("master-profile-update", async (event, profile) => {
    assertMasterSession(event);
    return masterAuth!.updateProfile(event.sender.id, profile);
  });
  ipcMain.handle("master-auth-logout", async (event) => {
    assertTrustedIpcSender(event);
    return masterAuth?.logout(event.sender.id) ?? { configured: false, authenticated: false, expiresAt: null };
  });

  ipcMain.handle("send-email", async (event, { smtpSettings, emailOptions }) => {
    assertTrustedIpcSender(event);
    assertUserPermission(event);
    try {
      const emailSize = Buffer.byteLength(JSON.stringify(emailOptions || {}), "utf8");
      if (emailSize > 25 * 1024 * 1024) throw new Error("Mensagem ou anexos demasiado grandes.");
      if (Buffer.byteLength(JSON.stringify(smtpSettings || {}), "utf8") > 16 * 1024) throw new Error("Configuracao SMTP invalida.");
      if (typeof emailOptions?.to !== "string" || emailOptions.to.length > 2_000 || typeof emailOptions?.subject !== "string" || emailOptions.subject.length > 500) {
        throw new Error("Destinatario ou assunto invalido.");
      }
      const port = parseInt(smtpSettings.port);
      let isSecure = smtpSettings.secure === true;
      if (port === 465) isSecure = true;
      if (port === 587) isSecure = false;
      const transporter = nodemailer.createTransport({
        host: smtpSettings.host,
        port,
        secure: isSecure,
        auth: { user: smtpSettings.user, pass: smtpSettings.pass },
        tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" }
      });
      await transporter.verify();
      const info = await transporter.sendMail({
        from: `"${smtpSettings.fromName}" <${smtpSettings.user}>`,
        to: emailOptions.to,
        subject: emailOptions.subject,
        text: emailOptions.text,
        html: emailOptions.html,
        attachments: emailOptions.attachments
      });
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error("SMTP Error:", error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown SMTP error" };
    }
  });
  ipcMain.handle("compose-native-email", async (event, { to, subject, body, attachment }) => {
    assertTrustedIpcSender(event);
    assertUserPermission(event);
    try {
      const { shell } = require("electron");
      const tempDir = path.join(os.tmpdir(), "tango-emails");
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const emlPath = path.join(tempDir, `email_${Date.now()}.eml`);
      let emlContent = `To: ${to}
Subject: ${subject}
X-Unsent: 1
Content-Type: multipart/mixed; boundary="boundary-example"

`;
      emlContent += `--boundary-example
Content-Type: text/plain; charset=UTF-8

${body}

`;
      if (attachment) {
        emlContent += `--boundary-example
Content-Type: application/pdf; name="${attachment.filename}"
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="${attachment.filename}"

${attachment.content}
`;
      }
      emlContent += `--boundary-example--`;
      fs.writeFileSync(emlPath, emlContent);
      await shell.openPath(emlPath);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("get-printers", async (event) => {
    assertTrustedIpcSender(event);
    assertUserPermission(event);
    try {
      const printers = await event.sender.getPrintersAsync();
      return printers.map((printer) => ({
        name: printer.name,
        displayName: printer.displayName || printer.name,
        description: printer.description,
        status: printer.status,
        isDefault: Boolean(printer.isDefault)
      }));
    } catch (error) {
      return [];
    }
  });
  ipcMain.handle("print-pdf", async (event, { pdfData, fileName, printerName, silent = true }) => {
    assertTrustedIpcSender(event);
    assertUserPermission(event);
    let printWindow = null;
    let tempPdfPath = "";
    try {
      let pdfBuffer;
      if (typeof pdfData === "string") {
        const base64 = pdfData.includes(",") ? pdfData.split(",").pop() || "" : pdfData;
        pdfBuffer = Buffer.from(base64, "base64");
      } else if (pdfData instanceof Uint8Array) {
        pdfBuffer = Buffer.from(pdfData);
      } else if (Array.isArray(pdfData)) {
        pdfBuffer = Buffer.from(pdfData);
      } else {
        throw new Error("PDF inválido para impressão.");
      }
      if (!pdfBuffer.length) throw new Error("PDF vazio para impressão.");
      if (pdfBuffer.length > 25 * 1024 * 1024) throw new Error("PDF demasiado grande para impressão.");
      if (!pdfBuffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("O ficheiro selecionado não é um PDF válido.");
      const printers = await event.sender.getPrintersAsync();
      const defaultPrinter = printers.find((printer) => printer.isDefault);
      const selectedPrinter = printerName ? printers.find((printer) => printer.name === printerName || printer.displayName === printerName) : defaultPrinter || printers[0];
      if (!selectedPrinter) {
        throw new Error("Nenhuma impressora disponível no sistema.");
      }
      const tempDir = path.join(os.tmpdir(), "tango-print");
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const safeName = String(fileName || `contrato-${Date.now()}.pdf`).replace(/[<>:"/\\|?*]+/g, "-");
      tempPdfPath = path.join(tempDir, `${Date.now()}-${safeName.endsWith(".pdf") ? safeName : `${safeName}.pdf`}`);
      fs.writeFileSync(tempPdfPath, pdfBuffer);
      printWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: !disableRendererSandbox,
          plugins: true
        }
      });
      await new Promise<void>((resolve, reject) => {
        if (!printWindow) return reject(new Error("Janela de impressão indisponível."));
        const timeout = setTimeout(() => reject(new Error("Tempo esgotado ao carregar o PDF para impressão.")), 2e4);
        printWindow.webContents.once("did-finish-load", () => {
          clearTimeout(timeout);
          resolve();
        });
        printWindow.webContents.once("did-fail-load", (_evt, _code, description) => {
          clearTimeout(timeout);
          reject(new Error(description || "Falha ao carregar PDF para impressão."));
        });
        printWindow.loadURL(url.pathToFileURL(tempPdfPath).toString());
      });
      await new Promise<void>((resolve, reject) => {
        if (!printWindow) return reject(new Error("Janela de impressão indisponível."));
        printWindow.webContents.print(
          {
            silent,
            printBackground: true,
            deviceName: selectedPrinter.name
          },
          (success, failureReason) => {
            if (success) resolve();
            else reject(new Error(failureReason || "A impressão não foi concluída."));
          }
        );
      });
      return {
        success: true,
        printerName: selectedPrinter.displayName || selectedPrinter.name,
        printers: printers.map((printer) => ({
          name: printer.name,
          displayName: printer.displayName || printer.name,
          isDefault: Boolean(printer.isDefault),
          status: printer.status
        }))
      };
    } catch (error) {
      return { success: false, error: error.message || String(error) };
    } finally {
      if (printWindow && !printWindow.isDestroyed()) printWindow.destroy();
      if (tempPdfPath) {
        setTimeout(() => {
          try {
            if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
          } catch (error) {
          }
        }, 5e3);
      }
    }
  });
  ipcMain.handle("encrypt-data", (event, data) => {
    assertTrustedIpcSender(event);
    assertUserPermission(event, "manage_settings");
    try {
      if (!safeStorage.isEncryptionAvailable()) throw new Error("Armazenamento seguro indisponivel.");
      return safeStorage.encryptString(data).toString("base64");
    } catch (e) {
      throw e;
    }
  });
  ipcMain.handle("decrypt-data", (event, base64Data) => {
    assertTrustedIpcSender(event);
    assertUserPermission(event, "manage_settings");
    try {
      if (!safeStorage.isEncryptionAvailable()) throw new Error("Armazenamento seguro indisponivel.");
      return safeStorage.decryptString(Buffer.from(base64Data, "base64")).toString();
    } catch (e) {
      throw e;
    }
  });
  ipcMain.handle("start-server", async (event, passkey) => {
    assertTrustedIpcSender(event);
    assertUserPermission(event, "manage_settings");
    if (typeof passkey !== "string" || passkey.length < 12) throw new Error("Defina uma chave de sincronizacao com pelo menos 12 caracteres.");
    return startServerInternal(passkey);
  });
  ipcMain.handle("stop-server", async (event) => {
    assertTrustedIpcSender(event);
    assertUserPermission(event, "manage_settings");
    if (server) {
      server.close();
      server = null;
      stopDiscovery();
      connectedClients.clear();
      if (mainWindow) mainWindow.webContents.send("clients-updated", []);
    }
    return { success: true };
  });
  ipcMain.handle("get-machine-id", async (event) => {
    assertTrustedIpcSender(event);
    return new Promise((resolve) => {
      if (process.platform === 'darwin') {
        try {
          const { execSync } = require('child_process');
          const stdout = execSync("ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID").toString();
          const match = stdout.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
          if (match && match[1]) {
            const uuid = match[1].trim();
            const crypto = require('crypto');
            resolve(crypto.createHash('sha256').update(uuid).digest('hex').toUpperCase());
            return;
          }
        } catch (e) {
          console.error("[main] Failed to get macOS platform UUID:", e);
        }
      }

      const psScript = `try {
                $bios = Get-WmiObject Win32_ComputerSystemProduct | Select-Object -ExpandProperty UUID
                $baseboard = Get-WmiObject Win32_BaseBoard | Select-Object -ExpandProperty SerialNumber
                $cpu = Get-WmiObject Win32_Processor | Select-Object -ExpandProperty ProcessorId
                if ([string]::IsNullOrWhiteSpace($bios)) { $bios = "NO_BIOS" }
                if ([string]::IsNullOrWhiteSpace($baseboard)) { $baseboard = "NO_BOARD" }
                if ([string]::IsNullOrWhiteSpace($cpu)) { $cpu = "NO_CPU" }
                Write-Output "$bios|$baseboard|$cpu"
            } catch { Write-Output "ERROR" }`;
      const { spawn } = require("child_process");
      const child = spawn("powershell", ["-NoProfile", "-Command", psScript]);
      child.on("error", (err) => {
        console.error("[Spawn error caught]", err);
      });
      let output = "";
      child.stdout.on("data", (data) => output += data.toString());
      child.on("close", () => {
        const raw = output.trim();
        if (!raw || raw === "ERROR") {
          try {
            resolve(require("node-machine-id").machineIdSync());
          } catch (e) {
            resolve("FALLBACK-" + Date.now());
          }
        } else {
          resolve(crypto.createHash("sha256").update(raw).digest("hex").toUpperCase());
        }
      });
    });
  });
  ipcMain.handle("list-devices", async (event) => {
    assertTrustedIpcSender(event);
    assertUserPermission(event, "manage_clients");
    return new Promise((resolve) => {
      const psScript = `try {
                $mgr = New-Object -ComObject WIA.DeviceManager
                $devices = @()
                foreach ($d in $mgr.DeviceInfos) { $devices += @{ deviceId=$d.DeviceID; name=$d.Properties['Name'].Value; type=$d.Type; description=$d.Properties['Description'].Value } }
                $devices | ConvertTo-Json -Compress
            } catch { Write-Output "[]" }`;
      const { spawn } = require("child_process");
      const child = spawn("powershell", ["-NoProfile", "-Command", psScript]);
      child.on("error", (err) => {
        console.error("[Spawn error caught]", err);
      });
      let output = "";
      child.stdout.on("data", (data) => output += data.toString());
      child.on("close", () => {
        try {
          resolve(JSON.parse(output.trim() || "[]"));
        } catch (e) {
          resolve([]);
        }
      });
    });
  });
  ipcMain.handle("scan-document", async (event, deviceId) => {
    assertTrustedIpcSender(event);
    assertUserPermission(event, "manage_clients");
    return new Promise((resolve) => {
      const psScript = `try {
                $mgr = New-Object -ComObject WIA.DeviceManager
                $dev = $null
                $cleanId = "${(deviceId || "").replace(/[^a-zA-Z0-9\-_]/g, "")}"
                if ($cleanId -ne "") { foreach ($d in $mgr.DeviceInfos) { if ($d.DeviceID -eq $cleanId) { $dev = $d.Connect(); break } } }
                else { $dev = $mgr.DeviceInfos.Item(1).Connect() }
                if ($dev) {
                    $image = $dev.Items[1].Transfer()
                    $tempFile = "$env:TEMP\\scan_$(Get-Date -Format 'yyyyMMddHHmmss').jpg"
                    $image.SaveFile($tempFile)
                    Write-Output $tempFile
                } else { Write-Output "CANCELLED" }
            } catch { Write-Output "ERROR" }`;
      const { spawn } = require("child_process");
      const child = spawn("powershell", ["-NoProfile", "-Command", psScript]);
      child.on("error", (err) => {
        console.error("[Spawn error caught]", err);
      });
      let output = "";
      child.stdout.on("data", (data) => output += data.toString());
      child.on("close", () => {
        const t = output.trim();
        if (t === "CANCELLED" || t === "ERROR") resolve({ success: false, message: t });
        else if (fs.existsSync(t)) resolve({ success: true, image: `data:image/jpeg;base64,${fs.readFileSync(t).toString("base64")}` });
        else resolve({ success: false, message: "Not found" });
      });
    });
  });
  ipcMain.handle("promote-to-master", async (event, passkey) => {
    assertTrustedIpcSender(event);
    assertUserPermission(event, "manage_settings");
    if (server) return { success: true, isMaster: true };
    const result: any = await startServerInternal(passkey);
    if (result.success) broadcastToClients("mesh-reorganized", { newMaster: getLocalNetworkInfo().hostname });
    return { ...result, isMaster: true };
  });
  ipcMain.handle("get-mesh-priority", (event) => {
    assertTrustedIpcSender(event);
    const hostname = os.hostname();
    let hash = 0;
    for (let i = 0; i < hostname.length; i++) hash = (hash << 5) - hash + hostname.charCodeAt(i);
    return Math.abs(hash | 0);
  });
  ipcMain.handle("notify-db-update", (event) => { assertTrustedIpcSender(event); assertUserPermission(event); return broadcastToClients("db-update", { timestamp: (/* @__PURE__ */ new Date()).toISOString() }); });
  ipcMain.handle("is-server-running", (event) => { assertTrustedIpcSender(event); assertUserPermission(event); return !!server; });
  ipcMain.handle("get-connected-clients", (event) => { assertTrustedIpcSender(event); assertUserPermission(event, "manage_settings"); return Array.from(connectedClients.values()); });
  ipcMain.handle("get-ip-address", (event) => { assertTrustedIpcSender(event); return getLocalNetworkInfo(); });
  ipcMain.handle("get-network-info", async (event) => {
    assertTrustedIpcSender(event);
    const info = getLocalNetworkInfo();
    let isPrivate = true;
    try {
      const { execSync } = require("child_process");
      isPrivate = execSync('powershell "Get-NetConnectionProfile | Select-Object -ExpandProperty NetworkCategory"').toString().includes("Private");
    } catch (e) {
    }
    return { ...info, isPrivate };
  });
  ipcMain.handle("set-shared-config", (event, config) => {
    assertTrustedIpcSender(event);
    assertUserPermission(event, "manage_settings");
    const serialized = JSON.stringify(config ?? null);
    if (Buffer.byteLength(serialized, "utf8") > 512 * 1024) throw new Error("Configuracao partilhada demasiado grande.");
    cachedConfig = JSON.parse(serialized);
    return { success: true };
  });
  ipcMain.handle("fetch-server-config", async (event, { url: url2, passkey }) => {
    assertTrustedIpcSender(event);
    try {
      if (typeof url2 !== "string" || url2.length > 2_048 || typeof passkey !== "string" || passkey.length < 12 || passkey.length > 256) {
        throw new Error("Endereco ou chave de sincronizacao invalida.");
      }
      const target = new URL(url2);
      const host = target.hostname.replace(/^\[|\]$/g, "");
      const isPrivateHost = host === "localhost" || host === "127.0.0.1" || host === "::1" || host.startsWith("10.") || host.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.startsWith("fe80:");
      if (!isPrivateHost || !["http:", "https:"].includes(target.protocol) || (target.port && target.port !== "3000")) {
        throw new Error("O servidor de sincronizacao deve usar um endereco privado na porta 3000.");
      }
      const response = await fetch(url2, { headers: { "x-sync-passkey": passkey || "" }, signal: AbortSignal.timeout(3e4) });
      const data: any = await response.json();
      return { success: response.ok, status: response.status, data, message: response.ok ? null : (data?.message || `Erro ${response.status}`) };
    } catch (error: any) {
      return { success: false, message: error?.message || String(error) };
    }
  });
  ipcMain.handle("get-activations", async (event) => {
    assertTrustedIpcSender(event);
    if (isTangoMaster) assertMasterSession(event);
    else assertUserPermission(event, "manage_settings");
    return getActivations();
  });
  ipcMain.handle("read-license-keys", async (event) => {
    assertMasterSession(event);
    try {
      const searchPaths = [path.join(app.getPath("documents"), "TangoMaster_Config"), app.getAppPath(), process.resourcesPath];
      let pub = null;
      for (const p of searchPaths) {
        const pubP = path.join(p, "public_key.json");
        if (!pub && fs.existsSync(pubP)) pub = JSON.parse(fs.readFileSync(pubP, "utf8")).key;
      }
      return { success: true, publicKey: pub, hasPrivateKey: fs.existsSync(licenseVaultPath()) };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });
  ipcMain.handle("generate-license-keypair", async (event) => {
    assertMasterSession(event);
    const pair = crypto.generateKeyPairSync("rsa", {
      modulusLength: 3072,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" }
    });
    saveLicensePrivateKey(pair.privateKey);
    const sharedPath = path.join(app.getPath("documents"), "TangoMaster_Config");
    fs.mkdirSync(sharedPath, { recursive: true });
    fs.writeFileSync(path.join(sharedPath, "public_key.json"), JSON.stringify({ key: pair.publicKey }, null, 4), { mode: 0o644 });
    return { success: true, publicKey: pair.publicKey, hasPrivateKey: true };
  });
  ipcMain.handle("sign-license-payload", async (event, payload: string) => {
    assertMasterSession(event);
    if (typeof payload !== "string" || payload.length === 0 || payload.length > 64_000) throw new Error("Payload de licenca invalido.");
    let license: any;
    try { license = JSON.parse(Buffer.from(payload, "base64").toString("utf8")); }
    catch { throw new Error("Payload de licenca invalido."); }
    const requiredStrings = ["mid", "type", "tier", "exp", "iat", "jti", "kid", "alg"];
    if (requiredStrings.some(field => typeof license[field] !== "string" || !license[field])) throw new Error("Campos obrigatorios da licenca em falta.");
    if (license.alg !== "RS256" || license.licenseVersion !== 2 || !/^[-\w]{8,80}$/u.test(license.kid) || !/^[0-9a-f-]{36}$/iu.test(license.jti)) {
      throw new Error("Versao ou algoritmo de licenca invalido.");
    }
    const canonicalJson = JSON.stringify(Object.fromEntries(Object.keys(license).sort().map(key => [key, license[key]])));
    const canonicalPayload = Buffer.from(canonicalJson, "utf8").toString("base64");
    const signature = crypto.sign("sha256", Buffer.from(canonicalPayload, "utf8"), {
      key: readLicensePrivateKey(),
      padding: crypto.constants.RSA_PKCS1_PADDING
    });
    return { success: true, payload: canonicalPayload, signature: signature.toString("base64") };
  });
}
app.whenReady().then(async () => {
  configureAppIdentity();
  if (isTangoMaster) masterAuth = new MasterAuthService(app.getPath("userData"), {
    protect: (value) => {
      if (!safeStorage.isEncryptionAvailable()) throw new Error("Armazenamento seguro indisponivel para proteger o MFA Master.");
      return `safe:v1:${safeStorage.encryptString(value).toString("base64")}`;
    },
    reveal: (value) => value.startsWith("safe:v1:")
      ? safeStorage.decryptString(Buffer.from(value.slice("safe:v1:".length), "base64"))
      : value
  }, { requireMfa: false }); // Instalação de uso pessoal do proprietário: só palavra-passe.
  const SAFE_MIME_TYPES: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".pdf": "application/pdf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".txt": "text/plain",
    ".json": "application/json"
  };
  protocol.handle("safe-file", (request) => {
    const url$1 = request.url;
    try {
      let filePath = url$1.replace(/^safe-file:\/\/\/?/, "");
      const hashIdx = filePath.indexOf("#");
      if (hashIdx !== -1) filePath = filePath.substring(0, hashIdx);
      const queryIdx = filePath.indexOf("?");
      if (queryIdx !== -1) filePath = filePath.substring(0, queryIdx);
      try {
        filePath = decodeURIComponent(filePath);
      } catch {
        // preserve filePath if already decoded
      }
      const normalized = path.resolve(path.normalize(filePath));
      if (!isAllowedSafeFilePath(normalized)) {
        return new Response("Ficheiro nao autorizado", { status: 403 });
      }
      if (!fs.existsSync(normalized) || fs.statSync(normalized).isDirectory()) {
        return new Response("Ficheiro nao encontrado", { status: 404 });
      }
      const ext = path.extname(normalized).toLowerCase();
      const contentType = SAFE_MIME_TYPES[ext] || "application/octet-stream";
      const fileBuffer = fs.readFileSync(normalized);
      return new Response(fileBuffer, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Access-Control-Allow-Origin": "null",
          "Cache-Control": "no-cache"
        }
      });
    } catch (e) {
      console.error("[safe-file Protocol] Erro ao servir ficheiro:", e);
      return new Response("Erro ao carregar ficheiro", { status: 500 });
    }
  });
  registerMainHandlers();
  electron.session.defaultSession.webRequest.onHeadersReceived(
    { urls: ["http://*/*", "https://*/*"] },
    (details, callback) => {
    const isDev2 = !app.isPackaged;
    const csp = isDev2 ? [
      "default-src 'self' http://localhost:* ws://localhost:*",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*",
      "style-src 'self' 'unsafe-inline' http://localhost:*",
      "img-src 'self' data: blob: https: file: safe-file: http://localhost:*",
      "font-src 'self' data: file: safe-file: http://localhost:*",
      "connect-src 'self' blob: data: https: ws: wss: safe-file: http://localhost:* http://127.0.0.1:*",
      "worker-src 'self' blob: data: http://localhost:*",
      "frame-src 'self' blob: data: file: safe-file: http://localhost:*",
      "object-src 'self' blob: data:",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "manifest-src 'self'"
    ] : [
      "default-src 'self'",
      "script-src 'self' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https: file: safe-file:",
      "font-src 'self' data: file: safe-file:",
      "connect-src 'self' blob: data: https: wss: safe-file: http://localhost:3000 http://127.0.0.1:3000",
      "worker-src 'self' blob: data:",
      "frame-src 'self' blob: data: file: safe-file:",
      "object-src 'self' blob: data:",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "manifest-src 'self'"
    ];
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": csp.join("; "),
        "X-Content-Type-Options": ["nosniff"],
        "Referrer-Policy": ["no-referrer"],
        "Permissions-Policy": ["camera=(), microphone=(), geolocation=()"],
        "X-Frame-Options": ["DENY"]
      }
    });
  });
  electron.session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => {
    cb(["notifications", "fullscreen"].includes(perm));
  });
  removeMenuBar();
  const isDev = !app.isPackaged;
  const dbName = isTangoMaster ? "tango_master.sqlite" : isDev ? "dev_database.sqlite" : "database.sqlite";
  const userDataRoot = app.getPath("userData");
  if (!fs.existsSync(userDataRoot)) fs.mkdirSync(userDataRoot, { recursive: true });
  const DEFAULT_ACCOUNT_ID = "default";
  const ACCOUNTS_FILE = path.join(userDataRoot, "accounts.json");
  const ACCOUNTS_DIR = path.join(userDataRoot, "accounts");
  const DELETED_ACCOUNTS_DIR = path.join(userDataRoot, "deleted-accounts");
  const sanitizeAccountId = (name) => {
    const base = String(name || "conta").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 42);
    return base || "conta";
  };
  const defaultAccount = () => {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    return {
      id: DEFAULT_ACCOUNT_ID,
      name: "Conta Principal",
      createdAt: now,
      updatedAt: now,
      isDefault: true
    };
  };
  const readAccountsRegistry = () => {
    try {
      if (fs.existsSync(ACCOUNTS_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8"));
        const accounts = Array.isArray(parsed.accounts) ? parsed.accounts : [];
        const hasDefault = accounts.some((account) => account.id === DEFAULT_ACCOUNT_ID);
        const normalizedAccounts = hasDefault ? accounts : [defaultAccount(), ...accounts];
        const activeAccountId = normalizedAccounts.some((account) => account.id === parsed.activeAccountId) ? parsed.activeAccountId : DEFAULT_ACCOUNT_ID;
        return { activeAccountId, accounts: normalizedAccounts };
      }
    } catch (error) {
      console.warn("[Accounts] Falha ao ler registro de contas:", error);
    }
    return {
      activeAccountId: DEFAULT_ACCOUNT_ID,
      accounts: [defaultAccount()]
    };
  };
  const writeAccountsRegistry = (registry) => {
    if (!fs.existsSync(ACCOUNTS_DIR)) fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(registry, null, 2), "utf8");
  };
  const getAccountBaseDir = (accountId) => accountId === DEFAULT_ACCOUNT_ID ? userDataRoot : path.join(ACCOUNTS_DIR, accountId);
  const getAccountDbPath = (accountId) => path.join(getAccountBaseDir(accountId), dbName);
  const ensureAccountDir = (accountId) => {
    const accountDir = getAccountBaseDir(accountId);
    if (!fs.existsSync(accountDir)) fs.mkdirSync(accountDir, { recursive: true });
  };
  let accountsRegistry = readAccountsRegistry();
  const accountBootstrapAccess = new Map<string, { senderId: number; expiresAt: number }>();
  let activeAccount = accountsRegistry.accounts.find((account) => account.id === accountsRegistry.activeAccountId) || accountsRegistry.accounts[0] || defaultAccount();
  accountsRegistry.activeAccountId = activeAccount.id;
  accountsRegistry.accounts = accountsRegistry.accounts.map(
    (account) => account.id === activeAccount.id ? { ...account, lastOpenedAt: (/* @__PURE__ */ new Date()).toISOString(), updatedAt: (/* @__PURE__ */ new Date()).toISOString() } : account
  );
  ensureAccountDir(activeAccount.id);
  writeAccountsRegistry(accountsRegistry);
  let dbPath = getAccountDbPath(activeAccount.id);
  let accountLogPath = path.join(getAccountBaseDir(activeAccount.id), "db-worker.log");
  const getPublicAccounts = () => ({
    activeAccountId: accountsRegistry.activeAccountId,
    accounts: accountsRegistry.accounts.map((account) => ({
      ...account,
      dbExists: fs.existsSync(getAccountDbPath(account.id))
    }))
  });
  ipcMain.on("is-packaged", (event) => {
    event.returnValue = app.isPackaged;
  });
  ipcMain.handle("accounts-list", async (event) => {
    assertTrustedIpcSender(event);
    return getPublicAccounts();
  });
  ipcMain.handle("accounts-create", async (event, { name }) => {
    assertTrustedIpcSender(event);
    assertUserPermission(event, "manage_settings");
    const cleanName = String(name || "").trim();
    if (!cleanName) {
      return { success: false, error: "Informe um nome para a conta." };
    }
    accountsRegistry = readAccountsRegistry();
    const existingName = accountsRegistry.accounts.some((account2) => account2.name.trim().toLowerCase() === cleanName.toLowerCase());
    if (existingName) {
      return { success: false, error: "Já existe uma conta com este nome." };
    }
    const baseId = sanitizeAccountId(cleanName);
    let id = `${baseId}-${crypto.randomBytes(3).toString("hex")}`;
    while (accountsRegistry.accounts.some((account2) => account2.id === id)) {
      id = `${baseId}-${crypto.randomBytes(3).toString("hex")}`;
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const account = {
      id,
      name: cleanName,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now
    };
    ensureAccountDir(id);
    accountBootstrapAccess.set(id, { senderId: event.sender.id, expiresAt: Date.now() + 60 * 60 * 1000 });
    accountsRegistry.accounts.push(account);
    writeAccountsRegistry(accountsRegistry);
    return { success: true, account, activeAccountId: accountsRegistry.activeAccountId, relaunching: false };
  });
  ipcMain.handle("accounts-switch", async (event, accountId) => {
    assertTrustedIpcSender(event);
    accountsRegistry = readAccountsRegistry();
    const target = accountsRegistry.accounts.find((account) => account.id === accountId);
    if (!target) {
      return { success: false, error: "Conta não encontrada." };
    }
    ensureAccountDir(target.id);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    accountsRegistry.activeAccountId = target.id;
    accountsRegistry.accounts = accountsRegistry.accounts.map(
      (account) => account.id === target.id ? { ...account, lastOpenedAt: now, updatedAt: now } : account
    );
    writeAccountsRegistry(accountsRegistry);
    await switchAccountRuntime(target.id);
    userAuth.revokeSender(event.sender.id);
    return { success: true, activeAccountId: target.id, relaunching: false, reloadRequired: true };
  });
  ipcMain.handle("accounts-delete", async (event, payload) => {
    assertTrustedIpcSender(event);
    try {
      const accountId = String(payload?.accountId || "");
      accountsRegistry = readAccountsRegistry();
      const target = accountsRegistry.accounts.find((account) => account.id === accountId);
      if (!target) {
        return { success: false, error: "Conta nao encontrada." };
      }
      const bootstrap = accountBootstrapAccess.get(target.id);
      let authorized = Boolean(bootstrap && bootstrap.senderId === event.sender.id && bootstrap.expiresAt > Date.now());
      if (!authorized) {
        try { assertUserPermission(event, "manage_settings"); authorized = true; } catch { authorized = false; }
      }
      if (!authorized) return { success: false, error: "Sem permissao para eliminar esta conta." };
      if (target.id === DEFAULT_ACCOUNT_ID || target.isDefault) {
        return { success: false, error: "A Conta Principal nao pode ser eliminada." };
      }
      if (payload?.confirmation !== target.name || payload?.backupAcknowledged !== true) {
        return { success: false, error: "A confirmação reforçada da eliminação é inválida." };
      }
      const wasActive = accountsRegistry.activeAccountId === target.id;
      if (wasActive) {
        await switchAccountRuntime(DEFAULT_ACCOUNT_ID);
        userAuth.revokeSender(event.sender.id);
      }
      const sourceDir = getAccountBaseDir(target.id);
      let archivedPath;
      if (fs.existsSync(sourceDir)) {
        if (!fs.existsSync(DELETED_ACCOUNTS_DIR)) fs.mkdirSync(DELETED_ACCOUNTS_DIR, { recursive: true });
        const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
        let destination = path.join(DELETED_ACCOUNTS_DIR, `${target.id}-${timestamp}`);
        let suffix = 1;
        while (fs.existsSync(destination)) {
          destination = path.join(DELETED_ACCOUNTS_DIR, `${target.id}-${timestamp}-${suffix++}`);
        }
        fs.renameSync(sourceDir, destination);
        archivedPath = destination;
      }
      accountsRegistry = readAccountsRegistry();
      accountsRegistry.accounts = accountsRegistry.accounts.filter((account) => account.id !== target.id);
      accountBootstrapAccess.delete(target.id);
      accountsRegistry.activeAccountId = accountsRegistry.accounts.some((account) => account.id === accountsRegistry.activeAccountId) ? accountsRegistry.activeAccountId : DEFAULT_ACCOUNT_ID;
      writeAccountsRegistry(accountsRegistry);
      return {
        success: true,
        deletedAccountId: target.id,
        activeAccountId: accountsRegistry.activeAccountId,
        archivedPath,
        switchedToDefault: wasActive,
        reloadRequired: wasActive
      };
    } catch (error) {
      console.error("[Accounts] Falha ao eliminar conta:", error);
      return { success: false, error: error?.message || "Nao foi possivel eliminar a conta." };
    }
  });
  async function getDbEncryptionKey() {
    return new Promise((resolve) => {
      const { exec } = require("child_process");
      let rawId = os.hostname();
      const command = process.platform === "win32" ? 'powershell "(Get-CimInstance Win32_ComputerSystemProduct).UUID"' : process.platform === "darwin" ? "ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID" : "";
      if (!command || isDev) {
        resolve(crypto.createHash("sha256").update(rawId + "TANGO_SECURE_SALT").digest("hex"));
        return;
      }
      exec(command, (error, stdout) => {
        if (!error && stdout) rawId = stdout.trim();
        resolve(crypto.createHash("sha256").update(rawId + "TANGO_SECURE_SALT").digest("hex"));
      });
    });
  }
  function hashDbKey(raw) {
    return crypto.createHash("sha256").update(raw + "TANGO_SECURE_SALT").digest("hex");
  }
  function runPowerShellScript(script) {
    return new Promise((resolve) => {
      if (process.platform !== "win32") {
        resolve(null);
        return;
      }
      const { spawn } = require("child_process");
      const child = spawn("powershell", ["-NoProfile", "-Command", script]);
      child.on("error", (err) => {
        console.error("[Spawn error caught]", err);
      });
      let output = "";
      child.stdout.on("data", (data) => output += data.toString());
      child.on("error", () => resolve(null));
      child.on("close", () => {
        const value = output.trim();
        resolve(value && value !== "ERROR" ? value : null);
      });
    });
  }
  async function getDbEncryptionKeyCandidates() {
    const candidates = /* @__PURE__ */ new Set();
    const add = (value) => {
      const normalized = String(value || "").trim();
      if (normalized) candidates.add(normalized);
    };
    const addSalted = (value) => {
      const normalized = String(value || "").trim();
      if (normalized) candidates.add(hashDbKey(normalized));
    };
    add(await getDbEncryptionKey());
    addSalted(os.hostname());
    addSalted(process.env.COMPUTERNAME);
    const uuid = await runPowerShellScript("(Get-CimInstance Win32_ComputerSystemProduct).UUID");
    addSalted(uuid);
    const hardwareRaw = await runPowerShellScript(`try {
            $bios = Get-WmiObject Win32_ComputerSystemProduct | Select-Object -ExpandProperty UUID
            $baseboard = Get-WmiObject Win32_BaseBoard | Select-Object -ExpandProperty SerialNumber
            $cpu = Get-WmiObject Win32_Processor | Select-Object -ExpandProperty ProcessorId
            if ([string]::IsNullOrWhiteSpace($bios)) { $bios = "NO_BIOS" }
            if ([string]::IsNullOrWhiteSpace($baseboard)) { $baseboard = "NO_BOARD" }
            if ([string]::IsNullOrWhiteSpace($cpu)) { $cpu = "NO_CPU" }
            Write-Output "$bios|$baseboard|$cpu"
        } catch { Write-Output "ERROR" }`);
    if (typeof hardwareRaw === "string" && hardwareRaw) {
      const hardwareHash = crypto.createHash("sha256").update(hardwareRaw).digest("hex");
      add(hardwareHash);
      add(hardwareHash.toUpperCase());
      addSalted(hardwareHash);
      addSalted(hardwareHash.toUpperCase());
    }
    return Array.from(candidates);
  }
  let dbWorker = null;
  const pendingRequests = /* @__PURE__ */ new Map();
  const rejectPendingDbRequests = (message) => {
    for (const [id, p] of pendingRequests) {
      clearTimeout(p.timeout);
      p.reject(new Error(message));
      pendingRequests.delete(id);
    }
  };
  const applyDatabaseIndexes = async () => {
    try {
      const indexPath = path.join(__dirname, "database-indexes.sql");
      const sqlPath = fs.existsSync(indexPath) ? indexPath : path.join(process.cwd(), "electron", "database-indexes.sql");
      if (!fs.existsSync(sqlPath)) return;
      const indexesSql = fs.readFileSync(sqlPath, "utf8");
      const statements = indexesSql.split(";").map((s) => s.trim()).filter((s) => s.length > 0);
      for (const stmt of statements) {
        try {
          await runQuery("exec", stmt);
        } catch (err) {
          console.warn(`[DB] Erro ao aplicar indice "${stmt.substring(0, 60)}...":`, err.message);
        }
      }
    } catch (e) {
      console.warn("[DB] Erro ao carregar arquivo de indices:", e);
    }
  };
  const attachDbWorkerHandlers = (worker) => {
    worker.on("message", (res) => {
      const p = pendingRequests.get(res.id);
      if (p) {
        clearTimeout(p.timeout);
        if (res.success) p.resolve(res.result);
        else p.reject(new Error(res.error));
        pendingRequests.delete(res.id);
      }
    });
    worker.on("error", (err) => {
      console.error("[DB Worker] Erro Fatal:", err.stack || err);
      rejectPendingDbRequests(`Erro no Worker: ${err.message}`);
    });
    worker.on("exit", (code) => {
      console.warn(`[DB Worker] Worker terminou (código ${code})`);
      if (dbWorker === worker) {
        dbWorker = null;
      }
    });
  };
  const resolveDbWorkerPath = () => {
    const bundledPath = path.join(__dirname, "db-worker.cjs");
    const unpackedPath = bundledPath.replace(
      `${path.sep}app.asar${path.sep}`,
      `${path.sep}app.asar.unpacked${path.sep}`
    );
    const candidates = [
      unpackedPath,
      bundledPath,
      path.join(process.cwd(), "dist-electron", "db-worker.cjs")
    ];
    return candidates.find((candidate) => fs.existsSync(candidate)) || null;
  };
  const startDbWorker = async () => {
    try {
      const workerPath = resolveDbWorkerPath();
      if (!workerPath) {
        console.warn("[DB Worker] Arquivo db-worker.cjs nao encontrado em nenhum caminho conhecido.");
        dbWorker = null;
        return;
      }
      ensureAccountDir(activeAccount.id);
      const encryptionKeys = await getDbEncryptionKeyCandidates();
      const encryptionKey = encryptionKeys[0] || "";
      const worker = new Worker(workerPath, {
        workerData: {
          dbPath,
          encryptionKey,
          encryptionKeys,
          logPath: accountLogPath,
          accountId: activeAccount.id
        }
      });
      dbWorker = worker;
      attachDbWorkerHandlers(worker);
      setTimeout(() => {
        void applyDatabaseIndexes();
      }, 2e3);
      console.log("[DB Worker] Worker iniciado com sucesso:", workerPath);
    } catch (err) {
      console.error("[DB Worker] Falha ao instanciar worker:", err);
      dbWorker = null;
    }
  };
  async function switchAccountRuntime(accountId) {
    accountsRegistry = readAccountsRegistry();
    const target = accountsRegistry.accounts.find((account) => account.id === accountId);
    if (!target) {
      throw new Error("Conta nao encontrada.");
    }
    ensureAccountDir(target.id);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    accountsRegistry.activeAccountId = target.id;
    accountsRegistry.accounts = accountsRegistry.accounts.map(
      (account) => account.id === target.id ? { ...account, lastOpenedAt: now, updatedAt: now } : account
    );
    activeAccount = accountsRegistry.accounts.find((account) => account.id === target.id) || target;
    dbPath = getAccountDbPath(activeAccount.id);
    financialSchemaBootstrapOpen = true;
    firstUserCreationReserved = false;
    accountLogPath = path.join(getAccountBaseDir(activeAccount.id), "db-worker.log");
    writeAccountsRegistry(accountsRegistry);
    rejectPendingDbRequests("Troca de conta em curso. A janela sera recarregada na nova conta.");
    const previousWorker = dbWorker;
    dbWorker = null;
    if (previousWorker) {
      try {
        await previousWorker.terminate();
      } catch (error) {
        console.warn("[DB Worker] Falha ao terminar worker anterior:", error);
      }
    }
    await startDbWorker();
    await runQuery("get", "SELECT 1 as ok", []);
  }
  try {
    await startDbWorker();
  } catch (e) {
    console.error("Worker failed", e);
  }
  const ensureWorkerRunning = async () => {
    if (!dbWorker) {
      await startDbWorker();
    }
    if (!dbWorker) {
      throw new Error("Trabalhador da base de dados não está a correr ou crashou");
    }
  };
  const runQuery = async (type, sql, params = []) => {
    await ensureWorkerRunning();
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timeout = setTimeout(() => {
        const p = pendingRequests.get(id);
        if (p) {
          const errorMsg = `Timeout (60s) para consulta ${type}: ${sql.substring(0, 100)}...`;
          console.warn(`⚠️ [Main] ${errorMsg}`);
          p.reject(new Error(errorMsg));
          pendingRequests.delete(id);
        }
      }, 6e4);
      pendingRequests.set(id, { resolve, reject, timeout });
      dbWorker.postMessage({ id, type, sql, params });
    });
  };
  const runTransaction = async (statements) => {
    await ensureWorkerRunning();
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timeout = setTimeout(() => {
        const p = pendingRequests.get(id);
        if (p) {
          p.reject(new Error("Timeout (60s) para transacao da base de dados."));
          pendingRequests.delete(id);
        }
      }, 6e4);
      pendingRequests.set(id, { resolve, reject, timeout });
      dbWorker.postMessage({ id, type: "transaction", statements });
    });
  };
  const runBackup = async (destination) => {
    await ensureWorkerRunning();
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timeout = setTimeout(() => {
        const p = pendingRequests.get(id);
        if (p) {
          p.reject(new Error("Timeout (5 min) para backup da base de dados."));
          pendingRequests.delete(id);
        }
      }, 5 * 60 * 1e3);
      pendingRequests.set(id, { resolve, reject, timeout });
      dbWorker.postMessage({ id, type: "backup", destination });
    });
  };
  const writeAuthAudit = async (user: any, action: string, details: string, metadata: Record<string, unknown> = {}) => {
    try {
      await runQuery("execute", `INSERT INTO audit_logs
        (id, timestamp, userId, userName, action, entity, details, metadata)
        VALUES (?, ?, ?, ?, ?, 'user', ?, ?)`, [
        crypto.randomUUID(), new Date().toISOString(), user?.id || null,
        user?.name || "Utilizador desconhecido", action, details,
        JSON.stringify({ source: "electron-main", ...metadata })
      ]);
    } catch (error) {
      console.warn("[Auth] Nao foi possivel gravar o evento de auditoria:", error instanceof Error ? error.message : error);
    }
  };
  const MFA_SECRET_PREFIX = "safe:v1:";
  const protectMfaSecret = (secret: string) => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("O armazenamento seguro do sistema nao esta disponivel para proteger o MFA.");
    return MFA_SECRET_PREFIX + safeStorage.encryptString(secret).toString("base64");
  };
  const revealMfaSecret = (storedSecret: string) => {
    if (!storedSecret.startsWith(MFA_SECRET_PREFIX)) return storedSecret;
    if (!safeStorage.isEncryptionAvailable()) throw new Error("O segredo MFA nao pode ser aberto neste dispositivo.");
    return safeStorage.decryptString(Buffer.from(storedSecret.slice(MFA_SECRET_PREFIX.length), "base64"));
  };
  const createMfaRecoveryCodes = () => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 8 }, () => {
      let value = "";
      for (let index = 0; index < 10; index++) value += alphabet[crypto.randomInt(0, alphabet.length)];
      return `${value.slice(0, 5)}-${value.slice(5)}`;
    });
  };
  const assertUserSqlAuthorized = async (event: Electron.IpcMainInvokeEvent, statements: Array<{ sql: string; params?: unknown[] }>) => {
    let reservedHere = false;
    try {
      for (const statement of statements) {
      const kind = userStatementKind(statement.sql);
      if (!kind) continue;
      if (kind === 'schema' && financialSchemaBootstrapOpen) continue;
      if (kind === 'insert') {
        const countRow: any = await runQuery("get", "SELECT COUNT(*) AS total FROM users");
        if (Number(countRow?.total || 0) === 0) {
          if (firstUserCreationReserved) throw new Error("A criacao do primeiro utilizador ja esta em curso.");
          const columns = statement.sql.match(/\busers\s*\(([^)]+)\)/iu)?.[1]
            .split(',').map(column => column.replace(/["'`\[\]]/gu, '').trim().toLowerCase()) || [];
          const roleIndex = columns.indexOf('role');
          const passwordIndex = columns.indexOf('password');
          const params = Array.isArray(statement.params) ? statement.params : [];
          if (roleIndex >= 0 && params[roleIndex] === 'super_admin' && passwordIndex >= 0 && /^\$2[aby]\$/u.test(String(params[passwordIndex] || ''))) {
            firstUserCreationReserved = true;
            reservedHere = true;
            continue;
          }
          throw new Error("O primeiro utilizador deve ser um super administrador com palavra-passe protegida.");
        }
      }
      const currentUser: any = userAuth.assertAuthenticated(event.sender.id);
      if (kind === 'update' && !userUpdateTouchesPrivileges(statement.sql) && /\bWHERE\s+id\s*=\s*\?\s*$/iu.test(statement.sql.trim())) {
        const params = Array.isArray(statement.params) ? statement.params : [];
        if (String(params[params.length - 1] || '') === String(currentUser.id)) continue;
      }
      if (!hasManageUsers(currentUser)) throw new Error("O utilizador nao possui permissao para gerir utilizadores.");
      }
      return reservedHere;
    } catch (error) {
      if (reservedHere) firstUserCreationReserved = false;
      throw error;
    }
  };
  ipcMain.handle("user-auth-login", async (event, credentials) => {
    assertTrustedIpcSender(event);
    financialSchemaBootstrapOpen = false;
    const login = typeof credentials?.login === "string" ? credentials.login.trim().toLowerCase() : "";
    const password = typeof credentials?.password === "string" ? credentials.password : "";
    if (!login || login.length > 254 || !password || password.length > 256) return { authenticated: false };
    const attempt = userLoginAttempts.get(login);
    if (attempt?.blockedUntil && attempt.blockedUntil > Date.now()) {
      throw new Error(`Demasiadas tentativas. Aguarde ${Math.ceil((attempt.blockedUntil - Date.now()) / 1000)} segundos.`);
    }
    const foundUser: any = await runQuery("get",
      "SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(username) = ? LIMIT 1", [login, login]);
    if (!foundUser) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      const failures = (attempt?.failures || 0) + 1;
      userLoginAttempts.set(login, { failures, blockedUntil: failures >= 3 ? Date.now() + Math.min(300_000, 2 ** (failures - 3) * 1_000) : 0 });
      await writeAuthAudit(null, "login_failure", "Tentativa de login falhada para utilizador desconhecido.", { reason: "not_found" });
      return { authenticated: false };
    }
    if (foundUser.status === "blocked") {
      const blockedAt = foundUser.blockedAt ? new Date(foundUser.blockedAt).getTime() : Number.NaN;
      if (!Number.isFinite(blockedAt) || Date.now() - blockedAt < 10 * 60 * 1e3) {
        await writeAuthAudit(foundUser, "login_failure", "Tentativa de acesso a uma conta temporariamente bloqueada.", { reason: "blocked" });
        throw new Error("Conta temporariamente bloqueada. Tente novamente mais tarde.");
      }
      await runQuery("execute", "UPDATE users SET status = 'active', failedAttempts = 0, blockedAt = NULL WHERE id = ?", [foundUser.id]);
      foundUser.status = "active";
      foundUser.failedAttempts = 0;
    }
    const valid = await bcrypt.compare(password.trim(), String(foundUser.password || ""));
    if (!valid) {
      const failures = Math.max(0, Number(foundUser.failedAttempts || 0)) + 1;
      const delay = failures >= 3 ? Math.min(300_000, 2 ** (failures - 3) * 1_000) : 0;
      userLoginAttempts.set(login, { failures, blockedUntil: Date.now() + delay });
      await runQuery("execute", "UPDATE users SET failedAttempts = ? WHERE id = ?", [failures, foundUser.id]);
      await writeAuthAudit(foundUser, "login_failure", "Tentativa de login falhada.",
        { reason: "invalid_password", failedAttempts: failures });
      return { authenticated: false };
    }
    userLoginAttempts.delete(login);
    const now = new Date().toISOString();
    await runQuery("execute", "UPDATE users SET failedAttempts = 0, blockedAt = NULL, lastLogin = ?, status = 'active' WHERE id = ?", [now, foundUser.id]);
    if (foundUser.twoFactorSecret) {
      const storedSecret = String(foundUser.twoFactorSecret);
      foundUser.twoFactorSecret = revealMfaSecret(storedSecret);
      if (!storedSecret.startsWith(MFA_SECRET_PREFIX) && safeStorage.isEncryptionAvailable()) {
        await runQuery("execute", "UPDATE users SET twoFactorSecret = ? WHERE id = ?", [protectMfaSecret(foundUser.twoFactorSecret), foundUser.id]);
      }
    }
    delete foundUser.password;
    foundUser.lastLogin = now;
    foundUser.status = "active";
    const requiresMfaEnrollment = foundUser.role === "super_admin" && !Boolean(foundUser.twoFactorEnabled);
    const result = userAuth.begin(event.sender.id, foundUser, requiresMfaEnrollment);
    if (result.authenticated) {
      await writeAuthAudit(foundUser, "login", "Login efetuado com sucesso.", { method: "password" });
    }
    return result;
  });
  ipcMain.handle("user-auth-verify-totp", async (event, payload) => {
    assertTrustedIpcSender(event);
    const userId = String(payload?.userId || "");
    const token = String(payload?.token || "").trim().toUpperCase();
    let result: any;
    if (/^\d{6}$/u.test(token)) {
      result = userAuth.verifyTotp(event.sender.id, userId, token);
    } else if (/^[A-Z2-9]{5}-[A-Z2-9]{5}$/u.test(token) && userAuth.hasPendingMfa(event.sender.id, userId)) {
      const record: any = await runQuery("get", "SELECT mfaRecoveryCodes FROM users WHERE id = ? LIMIT 1", [userId]);
      let hashes: string[] = [];
      try { hashes = JSON.parse(record?.mfaRecoveryCodes || "[]"); } catch { hashes = []; }
      let matchedIndex = -1;
      for (let index = 0; index < hashes.length; index++) {
        if (await bcrypt.compare(token, hashes[index])) { matchedIndex = index; break; }
      }
      if (matchedIndex >= 0) {
        hashes.splice(matchedIndex, 1);
        await runQuery("execute", "UPDATE users SET mfaRecoveryCodes = ? WHERE id = ?", [JSON.stringify(hashes), userId]);
        result = userAuth.completeMfaRecovery(event.sender.id, userId);
      } else result = { authenticated: false, reason: "invalid_code" };
    } else result = { authenticated: false, reason: userAuth.hasPendingMfa(event.sender.id, userId) ? "invalid_code" : "challenge_expired" };
    const auditUser = result.user || await runQuery("get", "SELECT id, name FROM users WHERE id = ? LIMIT 1", [userId]);
    await writeAuthAudit(auditUser, result.authenticated ? "login" : "login_failure",
      result.authenticated ? "Login com segundo fator efetuado com sucesso." : "Verificacao do segundo fator falhou.",
      { method: result.recovered ? "recovery_code" : "totp", reason: result.authenticated ? undefined : result.reason || "invalid_code" });
    return result;
  });
  ipcMain.handle("user-auth-status", async (event) => {
    assertTrustedIpcSender(event);
    return userAuth.status(event.sender.id);
  });
  ipcMain.handle("user-auth-bootstrap-status", async (event) => {
    assertTrustedIpcSender(event);
    const row: any = await runQuery("get", "SELECT COUNT(*) AS total FROM users");
    return { hasUsers: Number(row?.total || 0) > 0 };
  });
  ipcMain.handle("user-auth-logout", async (event) => {
    assertTrustedIpcSender(event);
    userAuth.revokeSender(event.sender.id);
    return { authenticated: false };
  });
  ipcMain.handle("user-auth-mfa-begin", async (event) => {
    assertTrustedIpcSender(event);
    return userAuth.beginMfaEnrollment(event.sender.id);
  });
  ipcMain.handle("user-auth-mfa-enable", async (event, payload) => {
    assertTrustedIpcSender(event);
    const confirmation: any = userAuth.confirmMfaEnrollment(event.sender.id, payload?.token);
    if (!confirmation.confirmed) return { enabled: false, reason: confirmation.reason };
    const recoveryCodes = createMfaRecoveryCodes();
    const recoveryHashes = await Promise.all(recoveryCodes.map(code => bcrypt.hash(code, 10)));
    await runQuery("execute", "UPDATE users SET twoFactorEnabled = 1, twoFactorSecret = ?, mfaRecoveryCodes = ? WHERE id = ?", [
      protectMfaSecret(confirmation.secret), JSON.stringify(recoveryHashes), confirmation.user.id
    ]);
    const updatedUser = userAuth.updateMfaState(event.sender.id, true);
    await writeAuthAudit(updatedUser, "mfa_enabled", "Autenticacao de dois fatores ativada.");
    return { enabled: true, user: updatedUser, recoveryCodes };
  });
  ipcMain.handle("user-auth-mfa-disable", async (event, payload) => {
    assertTrustedIpcSender(event);
    const currentUser: any = userAuth.assertAuthenticated(event.sender.id);
    const record: any = await runQuery("get", "SELECT twoFactorSecret, mfaRecoveryCodes FROM users WHERE id = ? LIMIT 1", [currentUser.id]);
    if (!record?.twoFactorSecret) {
      return { disabled: false };
    }
    const token = typeof payload?.token === 'string' ? payload.token.trim() : '';
    let valid = userAuth.verifyMfaForSession(event.sender.id, revealMfaSecret(String(record.twoFactorSecret)), token);
    if (!valid && token.includes('-') && record?.mfaRecoveryCodes) {
      try {
        const hashes: string[] = JSON.parse(record.mfaRecoveryCodes || '[]');
        for (const h of hashes) {
          if (await bcrypt.compare(token.toUpperCase(), h)) {
            valid = true;
            break;
          }
        }
      } catch { }
    }
    if (!valid) {
      return { disabled: false };
    }
    await runQuery("execute", "UPDATE users SET twoFactorEnabled = 0, twoFactorSecret = NULL, mfaRecoveryCodes = NULL WHERE id = ?", [currentUser.id]);
    const updatedUser = userAuth.updateMfaState(event.sender.id, false);
    await writeAuthAudit(updatedUser, "mfa_disabled", "Autenticacao de dois fatores desativada.");
    return { disabled: true, user: updatedUser };
  });
  ipcMain.handle("db-schema-ready", async (event) => {
    assertTrustedIpcSender(event);
    financialSchemaBootstrapOpen = false;
    return { ready: true };
  });
  ipcMain.handle("db-schema-status", async (event) => {
    assertTrustedIpcSender(event);
    return { ready: !financialSchemaBootstrapOpen };
  });
  ipcMain.handle("db-optimize", async (event) => {
    assertTrustedIpcSender(event);
    assertUserPermission(event, "manage_settings");
    await runQuery("exec", "VACUUM");
    return { success: true };
  });

  ipcMain.handle("db-execute", async (event, sql, params) => {
    assertTrustedIpcSender(event);
    const request = validateSqlRequest("execute", sql, params);
    assertRendererSqlAllowlisted([request], financialSchemaBootstrapOpen);
    assertFinancialSqlAuthorized(event, [request]);
    assertGenericSqlAuthorized(event, [request]);
    const reservedFirstUser = await assertUserSqlAuthorized(event, [request]);
    try {
      const r = await runQuery("execute", request.sql, request.params);
      broadcastToClients("db-update", { timestamp: (/* @__PURE__ */ new Date()).toISOString() });
      return r;
    } finally {
      if (reservedFirstUser) firstUserCreationReserved = false;
    }
  });
  ipcMain.handle("db-query", async (event, sql, params) => {
    assertTrustedIpcSender(event);
    const request = validateSqlRequest("query", sql, params);
    if (userReadExposesSecrets(request.sql)) throw new Error("A leitura de credenciais pelo renderer nao e permitida.");
    if (!financialSchemaBootstrapOpen) {
      const count: any = await runQuery("get", "SELECT COUNT(*) AS total FROM users");
      if (Number(count?.total || 0) > 0) userAuth.assertAuthenticated(event.sender.id);
    }
    return runQuery("query", request.sql, request.params);
  });
  ipcMain.handle("db-get", async (event, sql, params) => {
    assertTrustedIpcSender(event);
    const request = validateSqlRequest("get", sql, params);
    if (userReadExposesSecrets(request.sql)) throw new Error("A leitura de credenciais pelo renderer nao e permitida.");
    if (!financialSchemaBootstrapOpen) {
      const count: any = await runQuery("get", "SELECT COUNT(*) AS total FROM users");
      if (Number(count?.total || 0) > 0) userAuth.assertAuthenticated(event.sender.id);
    }
    return runQuery("get", request.sql, request.params);
  });
  ipcMain.handle("db-exec", async (event, sql) => {
    assertTrustedIpcSender(event);
    const request = validateSqlRequest("exec", sql);
    const splitStatements = (isApprovedLedgerTrigger(request.sql) ? [request.sql] : splitSqlStatements(request.sql))
      .map(statement => ({ sql: statement }));
    if (!financialSchemaBootstrapOpen) throw new Error("Comandos SQL de esquema só são permitidos durante migrações de arranque.");
    assertFinancialSqlAuthorized(event, splitStatements);
    await assertUserSqlAuthorized(event, splitStatements);
    const r = await runQuery("exec", request.sql);
    broadcastToClients("db-update", { timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    return r;
  });
  ipcMain.handle("db-transaction", async (event, statements) => {
    assertTrustedIpcSender(event);
    const safeStatements = validateDbTransaction(statements);
    assertRendererSqlAllowlisted(safeStatements, financialSchemaBootstrapOpen);
    assertFinancialSqlAuthorized(event, safeStatements);
    assertGenericSqlAuthorized(event, safeStatements);
    const reservedFirstUser = await assertUserSqlAuthorized(event, safeStatements);
    try {
      const r = await runTransaction(safeStatements);
      broadcastToClients("db-update", { timestamp: (/* @__PURE__ */ new Date()).toISOString() });
      return r;
    } finally {
      if (reservedFirstUser) firstUserCreationReserved = false;
    }
  });
  // Operações recebidas da nuvem: já foram autorizadas no dispositivo de origem e chegam cifradas com a
  // chave da empresa. O SQL é resolvido aqui (allowlist/esquema), nunca aceite em texto do renderer.
  ipcMain.handle("sync-apply-remote", async (event, groups) => {
    assertTrustedIpcSender(event);
    userAuth.assertAuthenticated(event.sender.id);
    if (financialSchemaBootstrapOpen) throw new Error("A base de dados ainda está a ser preparada.");
    if (!Array.isArray(groups) || groups.length > 500) throw new TypeError("Lote de sincronização inválido.");
    const columnsCache = new Map<string, Set<string>>();
    const result = await applyRemoteGroups(groups as RemoteGroup[], {
      sqlById: RENDERER_SQL_BY_ID,
      tableColumns: async (table) => {
        if (!/^[a-z_][a-z0-9_]*$/i.test(table)) return new Set();
        if (!columnsCache.has(table)) {
          const rows: any = await runQuery("query", `PRAGMA table_info("${table}")`);
          columnsCache.set(table, new Set((rows || []).map((row: any) => String(row.name))));
        }
        return columnsCache.get(table)!;
      },
      transaction: async (statements) => runTransaction(validateDbTransaction(statements))
    });
    if (result.applied || result.conflicts) broadcastToClients("db-update", { timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    return result;
  });
  ipcMain.handle("db-import", async (event, payload) => {
    assertTrustedIpcSender(event);
    const currentUser: any = userAuth.assertAuthenticated(event.sender.id);
    if (!hasPermission(currentUser, "manage_settings")) throw new Error("Sem permissao para importar bases de dados.");
    if (payload?.confirmation !== "SUBSTITUIR BASE DE DADOS") throw new Error("Confirmacao reforcada invalida.");
    const buffer = normalizeImportBuffer(payload?.data);
    await writeAuthAudit(currentUser, "database_import", "Substituicao integral da base de dados confirmada.");
    if (fs.existsSync(dbPath)) {
      const backupPath = `${dbPath}.before-import-${Date.now()}.bak`;
      try {
        if (dbWorker) await runBackup(backupPath);
        else fs.copyFileSync(dbPath, backupPath);
      } catch (error) {
        console.warn("[DB Import] Falha no backup online; usando copia direta:", error);
        fs.copyFileSync(dbPath, backupPath);
      }
    }
    if (dbWorker) await dbWorker.terminate();
    dbWorker = null;
    fs.writeFileSync(dbPath, buffer);
    app.relaunch();
    app.exit(0);
    return { success: true };
  });
  ipcMain.handle("db-save", async (event) => { assertTrustedIpcSender(event); assertUserPermission(event); return true; });
  const ensureAccountAssetDir = (folder) => {
    const dir = path.join(getAccountBaseDir(activeAccount.id), folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  };
  const sanitizeAssetId = (value, label) => {
    const text = String(value || "").trim();
    if (!/^[\w.-]{1,128}$/u.test(text)) throw new Error(`${label} invalido.`);
    return text;
  };
  const decodeBase64Payload = (base64Data) => {
    if (typeof base64Data !== "string" || base64Data.length > 15 * 1024 * 1024) {
      throw new Error("Imagem invalida.");
    }
    const commaIdx = base64Data.indexOf(",");
    const base64Bytes = commaIdx !== -1 ? base64Data.substring(commaIdx + 1) : base64Data;
    return Buffer.from(base64Bytes, "base64");
  };
  ipcMain.handle("save-avatar", async (event, { userId, base64Data }) => {
    assertTrustedIpcSender(event);
    const currentUser: any = assertUserPermission(event);
    if (String(currentUser.id) !== String(userId) && !hasManageUsers(currentUser)) throw new Error("Sem permissao para alterar este avatar.");
    const p = path.join(ensureAccountAssetDir("avatars"), `avatar_${sanitizeAssetId(userId, "Utilizador")}.jpg`);
    fs.writeFileSync(p, decodeBase64Payload(base64Data));
    return p;
  });
  ipcMain.handle("save-logo", async (event, { type, base64Data }) => {
    assertTrustedIpcSender(event);
    assertUserPermission(event, "manage_settings");
    const p = path.join(ensureAccountAssetDir("logos"), `logo_${sanitizeAssetId(type, "Tipo de logo")}.jpg`);
    fs.writeFileSync(p, decodeBase64Payload(base64Data));
    return p;
  });
  ipcMain.handle("delete-avatar", async (event, userId) => {
    assertTrustedIpcSender(event);
    const currentUser: any = assertUserPermission(event);
    if (String(currentUser.id) !== String(userId) && !hasManageUsers(currentUser)) throw new Error("Sem permissao para eliminar este avatar.");
    const p = path.join(ensureAccountAssetDir("avatars"), `avatar_${sanitizeAssetId(userId, "Utilizador")}.jpg`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return true;
  });
  ipcMain.handle("db-nuclear-reset", async (event, payload) => {
    assertTrustedIpcSender(event);
    try {
      let userCount = 0;
      try {
        const row: any = await runQuery("get", "SELECT COUNT(*) AS total FROM users");
        userCount = Number(row?.total || 0);
      } catch { userCount = 0; }
      if (userCount > 0) {
        const currentUser: any = userAuth.assertAuthenticated(event.sender.id);
        if (!hasPermission(currentUser, "manage_settings")) throw new Error("Sem permissao para eliminar os dados da aplicacao.");
        if (payload?.confirmation !== "APAGAR TODOS OS DADOS") throw new Error("Confirmacao reforcada invalida.");
        await writeAuthAudit(currentUser, "nuclear_reset", "Eliminacao integral dos dados da conta confirmada.");
      }
      if (dbWorker) {
        await dbWorker.terminate();
        dbWorker = null;
      }
      const filesToDelete = [
        dbPath,
        `${dbPath}-wal`,
        `${dbPath}-shm`,
        accountLogPath,
        path.join(app.getPath("userData"), "license_activations.json")
        // Optional: clear licenses too? Maybe verify with user, but "nuclear" implies everything.
      ];
      for (const file of filesToDelete) {
        if (fs.existsSync(file)) {
          try {
            fs.unlinkSync(file);
          } catch (e) {
          }
        }
      }
      app.relaunch();
      app.exit(0);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  const normalizeDateStr = (raw: any): string => {
    if (!raw) return "";
    if (raw instanceof Date && !isNaN(raw.getTime())) {
      return raw.toISOString().split("T")[0];
    }
    const str = String(raw).trim();
    if (!str) return "";
    return str;
  };

  function normalizarChaveConsulta(chave: string): string {
    return chave
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
  }

  function extrairValorConsulta(
    origem: unknown,
    nomes: readonly string[]
  ): unknown {
    const nomesNormalizados = new Set(nomes.map(normalizarChaveConsulta));
    const visitados = new Set<object>();
    const pendentes: unknown[] = [origem];

    while (pendentes.length > 0) {
      const atual = pendentes.shift();
      if (!atual || typeof atual !== "object") continue;
      if (visitados.has(atual)) continue;
      visitados.add(atual);

      if (Array.isArray(atual)) {
        pendentes.push(...atual);
        continue;
      }

      const registo = atual as Record<string, unknown>;

      const rotulo = registo.campo ?? registo.label ?? registo.nome ?? registo.name ?? registo.chave ?? registo.key;
      if (
        typeof rotulo === "string" &&
        nomesNormalizados.has(normalizarChaveConsulta(rotulo))
      ) {
        const valorRotulado =
          registo.valor ??
          registo.value ??
          registo.conteudo ??
          registo.content ??
          registo.data;
        if (valorRotulado !== undefined && valorRotulado !== null && valorRotulado !== "") {
          return valorRotulado;
        }
      }

      for (const [chave, valor] of Object.entries(registo)) {
        if (
          nomesNormalizados.has(normalizarChaveConsulta(chave)) &&
          valor !== undefined &&
          valor !== null &&
          valor !== ""
        ) {
          return valor;
        }
        if (valor && typeof valor === "object") {
          pendentes.push(valor);
        }
      }
    }

    return null;
  }

  function normalizarDataConsulta(valor: unknown): string | null {
    if (valor === undefined || valor === null || valor === "") return null;

    if (typeof valor === "object") {
      const valorInterno = extrairValorConsulta(valor, [
        "date", "data", "value", "valor", "formatted", "formatado"
      ]);
      return valorInterno === valor ? null : normalizarDataConsulta(valorInterno);
    }

    if (typeof valor === "number" && Number.isFinite(valor)) {
      const ms = valor < 10_000_000_000 ? valor * 1000 : valor;
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }

    const texto = String(valor).trim();
    if (!texto) return null;

    const validarPartes = (ano: number, mes: number, dia: number): string | null => {
      const data = new Date(Date.UTC(ano, mes - 1, dia));
      if (
        data.getUTCFullYear() !== ano ||
        data.getUTCMonth() !== mes - 1 ||
        data.getUTCDate() !== dia
      ) {
        return null;
      }
      return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    };

    const ymd = texto.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\D|$)/);
    if (ymd) {
      return validarPartes(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
    }

    const dmy = texto.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\D|$)/);
    if (dmy) {
      return validarPartes(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
    }

    const monthMap: Record<string, string> = {
      jan: "01", janeiro: "01", fev: "02", fevereiro: "02",
      mar: "03", marco: "03", março: "03", abr: "04", abril: "04",
      mai: "05", maio: "05", jun: "06", junho: "06",
      jul: "07", julho: "07", ago: "08", agosto: "08",
      set: "09", setembro: "09", out: "10", outubro: "10",
      nov: "11", novembro: "11", dez: "12", dezembro: "12"
    };
    const textMatch = texto.match(/(\d{1,2})\s*(?:de|-|\/)?\s*([a-zA-ZçÇáéíóúÁÉÍÓÚ]+)\s*(?:de|-|\/)?\s*(\d{4})/i);
    if (textMatch) {
      const d = textMatch[1].padStart(2, "0");
      const mStr = textMatch[2].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").substring(0, 3);
      const m = monthMap[mStr] || "01";
      return `${textMatch[3]}-${m}-${d}`;
    }

    const dataInterpretada = new Date(texto);
    return Number.isNaN(dataInterpretada.getTime()) ? null : dataInterpretada.toISOString().slice(0, 10);
  }

  function calcularIdade(dataNascimento: string | null | undefined): number | null {
    if (!dataNascimento) return null;
    const nascimento = new Date(`${dataNascimento}T00:00:00`);
    if (Number.isNaN(nascimento.getTime())) return null;
    const hoje = new Date();
    let idade = hoje.getFullYear() - nascimento.getFullYear();
    const aniversarioJaPassou =
      hoje.getMonth() > nascimento.getMonth() ||
      (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() >= nascimento.getDate());
    if (!aniversarioJaPassou) idade -= 1;
    return idade >= 0 && idade < 130 ? idade : null;
  }

  function detetarGeneroPorNome(nomeCompleto: string): "M" | "F" | "" {
    const primeiro = nomeCompleto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .split(/\s+/)[0] ?? "";
    if (primeiro.length < 3) return "";

    const NOMES_MASCULINOS = new Set([
      "jose", "joao", "pedro", "manuel", "antonio", "francisco", "domingos", "mario",
      "paulo", "carlos", "adao", "afonso", "agostinho", "alberto", "bernardo",
      "daniel", "david", "eduardo", "emanuel", "ernesto", "fernando", "gabriel",
      "garcia", "helder", "isaac", "jacinto", "joaquim", "jorge", "julio",
      "lourenco", "lucas", "luis", "marcos", "miguel", "moises", "nelson",
      "osvaldo", "rafael", "raul", "ricardo", "roberto", "rui", "salomao",
      "samuel", "sebastiao", "simao", "tomas", "vasco", "victor", "vitor", "abel",
      "adilson", "edson", "wilson", "gerson", "anderson", "kelson", "milton",
      "elton", "dionisio", "cristovao", "bento", "faustino", "feliciano", "filipe",
      "gaspar", "henrique", "andre", "armando", "augusto", "avelino", "baltazar",
      "casimiro", "celestino", "constantino", "diogo", "estevao", "eugenio",
      "evaristo", "ezequiel", "geraldo", "gil", "gregorio", "guilherme", "hugo",
      "isaias", "jaime", "jeremias", "job", "jonas", "leandro", "leonardo", "lino",
      "marcelino", "martinho", "mateus", "matias", "narciso", "nicolau", "noe",
      "octavio", "pascoal", "patricio", "paulino", "quintino", "romao", "rogerio",
      "rodrigo", "ruben", "salvador", "serafim", "silvino", "teodoro", "timoteo",
      "urbano", "valentim", "venancio", "vicente", "xavier", "zacarias", "luca",
      "jonata", "josue"
    ]);

    const NOMES_FEMININOS = new Set([
      "maria", "ana", "josefa", "teresa", "isabel", "luisa", "catarina", "domingas",
      "madalena", "veronica", "cristina", "esperanca", "felismina", "rosa", "joana",
      "marta", "ruth", "rute", "ester", "raquel", "beatriz", "ines", "lurdes",
      "fatima", "conceicao", "encarnacao", "anunciacao", "assuncao", "graca",
      "adelaide", "agostinha", "albertina", "amelia", "angela", "antonia",
      "aurora", "balbina", "barbara", "benedita", "bernarda", "brigida", "carmen",
      "carolina", "cecilia", "celeste", "clara", "claudia", "constanca", "deolinda",
      "dorotea", "elisa", "elisabete", "emilia", "eugenia", "eulalia", "eva",
      "filomena", "firmina", "florinda", "francisca", "gertrudes", "gloria",
      "helena", "henriqueta", "hortencia", "ilda", "irene", "jacinta", "joaquina",
      "judite", "julia", "juliana", "justina", "laura", "leonor", "lidia", "lucia",
      "luzia", "manuela", "margarida", "mariana", "marcelina", "matilde",
      "mercedes", "natalia", "olga", "olivia", "palmira", "paula", "paulina",
      "perpetua", "piedade", "prazeres", "regina", "rosalina", "rosaria", "sara",
      "silvia", "sofia", "susana", "teodora", "vitoria", "zulmira", "solange",
      "ivone", "edite", "arlete", "nilza", "neusa", "elsa", "sandra", "vanda",
      "wilma", "zita", "luz"
    ]);

    if (NOMES_MASCULINOS.has(primeiro)) return "M";
    if (NOMES_FEMININOS.has(primeiro)) return "F";

    if (primeiro.endsWith("cao")) return "F";
    if (primeiro.endsWith("son") || primeiro.endsWith("ton")) return "M";
    if (primeiro.endsWith("a") || primeiro.endsWith("as")) return "F";
    if (primeiro.endsWith("o") || primeiro.endsWith("os") || primeiro.endsWith("u") || primeiro.endsWith("or") || primeiro.endsWith("el")) return "M";

    return "";
  }

  function inferProvinceFromBI(biNumber: string): string {
    const match = (biNumber || "").toUpperCase().match(/\d{9}([A-Z]{2})\d{3}/);
    if (!match) return "";
    const code = match[1];
    const provinces: Record<string, string> = {
      BO: "Bengo", BE: "Benguela", BI: "Bié", CA: "Cabinda", CC: "Cuando Cubango",
      CN: "Cunene", HA: "Huambo", HL: "Huíla", KN: "Kwanza Norte", KS: "Kwanza Sul",
      LN: "Lunda Norte", LS: "Lunda Sul", LA: "Luanda", ML: "Malanje", MO: "Moxico",
      NE: "Namibe", UI: "Uíge", ZA: "Zaire"
    };
    return provinces[code] ? `Província de ${provinces[code]}, Angola` : "";
  }

  function normalizeGender(raw: any): string {
    if (!raw) return "";
    const g = String(raw).trim().toUpperCase();
    if (g.startsWith("M") || g.includes("MASC") || g === "HOMEM" || g === "H") return "M";
    if (g.startsWith("F") || g.includes("FEM") || g === "MULHER") return "F";
    if (g === "OUTRO" || g === "OTHER") return "Outro";
    return g;
  }

  function normalizeMaritalStatus(raw: any): string {
    if (!raw) return "";
    const s = String(raw).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (s.includes("SOLTEIR")) return "SOLTEIRO";
    if (s.includes("CASAD")) return "CASADO";
    if (s.includes("DIVORC")) return "DIVORCIADO";
    if (s.includes("VIUV")) return "VIUVO";
    if (s.includes("UNIAO") || s.includes("FACTO")) return "UNIAO_DE_FACTO";
    return s;
  }

  ipcMain.handle("lookup-bi", async (event, bi, type) => {
    assertTrustedIpcSender(event);
    // No Tango Master a sessão é do administrador master, não de um utilizador do ERP.
    let currentUser: any;
    if (isTangoMaster) {
      if (!masterAuth) throw new Error("Sessao do Tango Master indisponivel.");
      masterAuth.assertAuthenticated(event.sender.id);
      currentUser = { id: "tango-master", name: "Tango Master" };
    } else {
      currentUser = assertUserPermission(event, "manage_clients");
    }
    const cleanBI = (bi || "").trim().toUpperCase();
    if (!/^[A-Z0-9-]{9,32}$/u.test(cleanBI)) throw new Error("BI/NIF inválido.");
    await writeAuthAudit(currentUser, "document_lookup", "Consulta externa de documento iniciada.", { documentType: type === "COLECTIVO" ? "NIF" : "BI" });
    const isColectivo = type === "COLECTIVO";
    const encoded = encodeURIComponent(cleanBI);
    const endpoints = isColectivo ? [
      `https://joaotomas.elprimesolution.com/api/gateway/consulta-bi/consultar/${encoded}`,
      `https://consulta.edgarsingui.ao/consultar/${encoded}/nif`,
      `https://angolaapi.onrender.com/api/v1/validate/nif/${encoded}`,
      `https://angolaapi.herokuapp.com/api/v1/validate/nif/${encoded}`
    ] : [
      `https://joaotomas.elprimesolution.com/api/gateway/consulta-bi/consultar/${encoded}`,
      `https://joaotomas.elprimesolution.com/api/consulta-bi/${encoded}`,
      `https://consulta.edgarsingui.ao/consultar/${encoded}/bilhete`,
      `https://consulta.edgarsingui.ao/consultar/${encoded}`,
      `https://angolaapi.onrender.com/api/v1/validate/bi/${encoded}`,
      `https://angolaapi.herokuapp.com/api/v1/validate/bi/${encoded}`
    ];

    const mergedResult: any = {
      name: "",
      address: "",
      birthDate: "",
      age: undefined,
      issueDate: "",
      expiryDate: "",
      gender: "",
      maritalStatus: "",
      fatherName: "",
      motherName: "",
      source: ""
    };

    for (const url2 of endpoints) {
      try {
        const res = await fetch(url2, {
          signal: AbortSignal.timeout(8_000),
          headers: { 
            "Accept": "application/json",
            "User-Agent": "Tango-Gestao-Creditos/3.0"
          }
        });
        if (!res.ok) continue;
        const rawJson: any = await res.json().catch(() => null);
        if (!rawJson || rawJson.error === true || rawJson.success === false) continue;

        const conteudo = rawJson.data && typeof rawJson.data === "object" && !Array.isArray(rawJson.data)
          ? rawJson.data
          : {};
        const dados = { ...rawJson, ...conteudo };

        const name = extrairValorConsulta(dados, [
          "name", "nome", "full_name", "fullname", "nome_completo", "nomeCompleto", 
          "razao_social", "razaoSocial", "designacao", "titular"
        ]);

        if (name && !mergedResult.name) {
          mergedResult.name = String(name).trim().toUpperCase();
          mergedResult.source = url2.includes("joaotomas")
            ? "João Tomás API (El Prime Solution)"
            : url2.includes("edgarsingui")
              ? "Edgar Singui API"
              : "Angola API";
        }

        const rawBirth = extrairValorConsulta(dados, [
          "birth_date", "data_de_nascimento", "data_nascimento", "nascimento", 
          "data_nasc", "dt_nascimento", "dt_nasc", "birthdate", "birthDate", "born", "dataNasc"
        ]);
        const birthDate = normalizarDataConsulta(rawBirth);
        if (birthDate && !mergedResult.birthDate) {
          mergedResult.birthDate = birthDate;
          const calcAge = calcularIdade(birthDate);
          if (calcAge !== null) mergedResult.age = calcAge;
        }

        const rawAge = extrairValorConsulta(dados, ["idade", "age", "anos"]);
        if (rawAge !== undefined && rawAge !== null && Number(rawAge) > 0 && !mergedResult.age) {
          mergedResult.age = Number(rawAge);
        }

        const rawIssue = extrairValorConsulta(dados, [
          "issue_date", "issued_at", "issued_on", "issuance_date", "date_of_issue", 
          "data_emissao", "emissao_data", "emissao", "data_de_emissao", "data_emissao_bi", 
          "emissao_bi", "data_expedicao", "expedicao_data", "expedicao", "data_registo"
        ]);
        const issueDate = normalizarDataConsulta(rawIssue);
        if (issueDate && !mergedResult.issueDate) {
          mergedResult.issueDate = issueDate;
        }

        const rawExpiry = extrairValorConsulta(dados, [
          "expiry_date", "expiration_date", "expires_at", "expire_date", "valid_until", 
          "validity_date", "date_of_expiry", "data_caducidade", "caducidade_data", 
          "caducidade", "data_validade", "validade_data", "validade", "data_de_validade", 
          "data_fim_validade", "data_validade_bi", "validade_bi", "fim_validade", 
          "data_expiracao", "expiracao", "data_vencimento", "vencimento", "data_exp"
        ]);
        const expiryDate = normalizarDataConsulta(rawExpiry);
        if (expiryDate && !mergedResult.expiryDate) {
          mergedResult.expiryDate = expiryDate;
        }

        const rawAddress = extrairValorConsulta(dados, [
          "morada", "residencia", "endereco", "address", "localidade", "domicilio"
        ]) || [
          extrairValorConsulta(dados, ["bairro", "neighborhood"]),
          extrairValorConsulta(dados, ["municipio", "municipality"]),
          extrairValorConsulta(dados, ["provincia", "province"]),
          extrairValorConsulta(dados, ["naturalidade"])
        ].filter(Boolean).join(", ");

        if (rawAddress && !mergedResult.address) {
          mergedResult.address = typeof rawAddress === "string"
            ? rawAddress.trim()
            : typeof rawAddress === "object"
              ? Object.values(rawAddress as any).filter((v: any) => typeof v === "string" && v.trim()).join(", ")
              : "";
        }

        const rawGender = extrairValorConsulta(dados, ["gender", "genero", "sexo", "sex", "genero_descricao", "sexo_descricao"]);
        const gender = normalizeGender(rawGender);
        if (gender && !mergedResult.gender) {
          mergedResult.gender = gender;
        }

        const rawMarital = extrairValorConsulta(dados, ["marital_status", "maritalStatus", "estado_civil", "estadoCivil", "estado_civil_descricao"]);
        const maritalStatus = normalizeMaritalStatus(rawMarital);
        if (maritalStatus && !mergedResult.maritalStatus) {
          mergedResult.maritalStatus = maritalStatus;
        }

        const rawFather = extrairValorConsulta(dados, ["father", "father_name", "pai", "nome_pai", "pai_nome_completo"]);
        if (rawFather && !mergedResult.fatherName) {
          mergedResult.fatherName = String(rawFather).trim();
        }

        const rawMother = extrairValorConsulta(dados, ["mother", "mother_name", "mae", "nome_mae", "mae_nome_completo"]);
        if (rawMother && !mergedResult.motherName) {
          mergedResult.motherName = String(rawMother).trim();
        }

        if (mergedResult.name && mergedResult.birthDate && mergedResult.gender && mergedResult.address && mergedResult.expiryDate) {
          break;
        }
      } catch (e) {
        // Segue para o próximo endpoint
      }
    }

    if (mergedResult.name) {
      if (!mergedResult.gender) {
        const detectedGender = detetarGeneroPorNome(mergedResult.name);
        if (detectedGender) mergedResult.gender = detectedGender;
      }
      if (!mergedResult.address && !isColectivo) {
        mergedResult.address = inferProvinceFromBI(cleanBI);
      }
      if (mergedResult.birthDate && (!mergedResult.age || mergedResult.age === 0)) {
        const calcAge = calcularIdade(mergedResult.birthDate);
        if (calcAge !== null) mergedResult.age = calcAge;
      }

      return {
        success: true,
        ...mergedResult
      };
    }

    return { success: false, message: "Dados não encontrados ou serviço indisponível" };
  });
  ipcMain.handle("select-image", async (event) => {
    assertTrustedIpcSender(event);
    assertUserPermission(event);
    const imageDialogOptions: Electron.OpenDialogOptions = {
      title: "Selecionar Imagem",
      filters: [
        { name: "Imagens", extensions: ["jpg", "png", "jpeg", "webp"] }
      ],
      properties: ["openFile"]
    };
    const { canceled, filePaths } = mainWindow ? await dialog.showOpenDialog(mainWindow, imageDialogOptions) : await dialog.showOpenDialog(imageDialogOptions);
    if (canceled || filePaths.length === 0) return null;
    const filePath = filePaths[0];
    const data = fs.readFileSync(filePath);
    const extension = path.extname(filePath).slice(1).toLowerCase();
    return `data:image/${extension === "jpg" ? "jpeg" : extension};base64,${data.toString("base64")}`;
  });
  ipcMain.handle("db-export", async (event) => {
    assertTrustedIpcSender(event);
    const currentUser: any = userAuth.assertAuthenticated(event.sender.id);
    if (!hasPermission(currentUser, "manage_settings")) throw new Error("Sem permissao para exportar a base de dados.");
    let temporaryPath = null;
    let previousPath = null;
    try {
      if (!dbWorker) await startDbWorker();
      await runQuery("get", "SELECT 1 AS ok", []);

      const accountSlug = sanitizeAccountId(activeAccount.name || activeAccount.id);
      const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
      const backupDialogOptions = {
        title: `${APP_DOWNLOAD_TITLE} - Guardar backup`,
        defaultPath: path.join(getTangoDownloadDir("Backups"), `backup-${accountSlug}-${timestamp}.sqlite`),
        buttonLabel: "Guardar",
        filters: [{ name: "Base de dados SQLite", extensions: ["sqlite"] }]
      };
      const { canceled, filePath } = mainWindow ? await dialog.showSaveDialog(mainWindow, backupDialogOptions) : await dialog.showSaveDialog(backupDialogOptions);
      if (canceled || !filePath) return { success: false, canceled: true };

      const destination = path.extname(filePath) ? filePath : `${filePath}.sqlite`;
      if (path.resolve(destination) === path.resolve(dbPath)) {
        throw new Error("O backup nao pode substituir a base de dados que esta em uso.");
      }

      const destinationDir = path.dirname(destination);
      fs.accessSync(destinationDir, fs.constants.W_OK);
      temporaryPath = path.join(destinationDir, `.${path.basename(destination)}.${crypto.randomUUID()}.partial`);
      const backupResult: any = await runBackup(temporaryPath);
      const backupStats = fs.statSync(temporaryPath);
      if (!backupStats.isFile() || backupStats.size === 0) {
        throw new Error("O ficheiro de backup gerado esta vazio.");
      }

      if (fs.existsSync(destination)) {
        previousPath = `${destination}.${crypto.randomUUID()}.previous`;
        fs.renameSync(destination, previousPath);
      }
      try {
        fs.renameSync(temporaryPath, destination);
        temporaryPath = null;
      } catch (replaceError) {
        if (previousPath && fs.existsSync(previousPath) && !fs.existsSync(destination)) {
          fs.renameSync(previousPath, destination);
          previousPath = null;
        }
        throw replaceError;
      }
      if (previousPath && fs.existsSync(previousPath)) fs.unlinkSync(previousPath);
      previousPath = null;

      return {
        success: true,
        filePath: destination,
        size: backupStats.size,
        totalPages: backupResult?.totalPages
      };
    } catch (error) {
      console.error("[DB Export] Falha ao exportar a base de dados:", error);
      return {
        success: false,
        error: error?.message || "Falha desconhecida ao exportar a base de dados."
      };
    } finally {
      if (temporaryPath && fs.existsSync(temporaryPath)) {
        try {
          fs.unlinkSync(temporaryPath);
        } catch (cleanupError) {
          console.warn("[DB Export] Nao foi possivel remover o ficheiro temporario:", cleanupError);
        }
      }
      if (previousPath && fs.existsSync(previousPath)) {
        console.warn("[DB Export] Copia anterior preservada apos falha:", previousPath);
      }
    }
  });
  createWindow();
  startListening();
  const backupRecoveryVaultPath = () => path.join(getAccountBaseDir(activeAccount.id), "backup-recovery-key.bin");
  const getOrCreateBackupRecoveryKey = () => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Armazenamento seguro indisponivel para proteger a chave de recuperacao.");
    const vaultPath = backupRecoveryVaultPath();
    if (fs.existsSync(vaultPath)) return safeStorage.decryptString(fs.readFileSync(vaultPath));
    const recoveryKey = `TGRK-${crypto.randomBytes(32).toString("base64url")}`;
    fs.writeFileSync(vaultPath, safeStorage.encryptString(recoveryKey), { mode: 0o600, flag: "wx" });
    return recoveryKey;
  };
  async function backupDatabase() {
    try {
      const backupDir = path.join(app.getPath("userData"), "backups");
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
      const accountSlug = sanitizeAccountId(activeAccount.name || activeAccount.id);
      const backupPath = path.join(backupDir, `tango_${accountSlug}_${timestamp}.db`);
      if (fs.existsSync(dbPath)) {
        const encryptedPath = `${backupPath}.encrypted`;
        const result = await writeVerifiedBackup(encryptedPath, runBackup, safeStorage, getOrCreateBackupRecoveryKey());
        const backups = fs.readdirSync(backupDir).filter((f) => f.startsWith(`tango_${accountSlug}_`) && f.endsWith(".encrypted")).sort().reverse();
        backups.slice(7).forEach((old) => {
          try { fs.unlinkSync(path.join(backupDir, old)); }
          catch (error) { console.warn('[Backup] Falha ao aplicar retencao:', error); }
        });
        try {
          await runQuery(
            "execute",
            "UPDATE company_settings SET lastBackupDate = ? WHERE id = 1",
            [(/* @__PURE__ */ new Date()).toISOString()]
          );
        } catch (e) {
          console.warn("[Backup] Could not update lastBackupDate:", e);
        }
        return result;
      } else {
        throw new Error(`Base de dados nao encontrada: ${dbPath}`);
      }
    } catch (error) {
      console.error("[Backup] Falha ao criar copia de seguranca:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  function scheduleBackup() {
    const now = /* @__PURE__ */ new Date();
    const next2AM = new Date(now);
    next2AM.setHours(2, 0, 0, 0);
    if (next2AM <= now) {
      next2AM.setDate(next2AM.getDate() + 1);
    }
    const msUntil2AM = next2AM.getTime() - now.getTime();
    setTimeout(() => {
      backupDatabase();
      setInterval(backupDatabase, 24 * 60 * 60 * 1e3);
    }, msUntil2AM);
  }
  scheduleBackup();
  ipcMain.handle("backup-database", async (event) => {
    assertTrustedIpcSender(event);
    const currentUser: any = userAuth.assertAuthenticated(event.sender.id);
    if (!hasPermission(currentUser, "manage_settings")) throw new Error("Sem permissao para criar backups.");
    return backupDatabase();
  });
  ipcMain.handle("get-backup-recovery-key", async (event) => {
    assertTrustedIpcSender(event);
    const currentUser: any = userAuth.assertAuthenticated(event.sender.id);
    if (!hasPermission(currentUser, "manage_settings")) throw new Error("Sem permissao para exportar a chave de recuperacao.");
    await writeAuthAudit(currentUser, "backup_recovery_key_exported", "Chave de recuperacao de backups apresentada ao utilizador.");
    return { recoveryKey: getOrCreateBackupRecoveryKey() };
  });
  ipcMain.handle("restore-backup", async (event, payload) => {
    assertTrustedIpcSender(event);
    const currentUser: any = userAuth.assertAuthenticated(event.sender.id);
    if (!hasPermission(currentUser, "manage_settings")) throw new Error("Sem permissao para restaurar backups.");
    const options = {
      title: `${APP_DOWNLOAD_TITLE} - Restaurar copia de seguranca`,
      properties: ["openFile"] as Electron.OpenDialogOptions["properties"],
      filters: [{ name: "Backup encriptado do Tango", extensions: ["encrypted"] }]
    };
    const selection = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    if (selection.canceled || !selection.filePaths[0]) return { success: false, canceled: true };
    if (!safeStorage.isEncryptionAvailable()) return { success: false, error: "Armazenamento seguro indisponivel neste dispositivo." };

    const sourcePath = path.resolve(selection.filePaths[0]);
    const rollbackPath = `${dbPath}.before-restore-${Date.now()}.bak`;
    const restoredTempPath = `${dbPath}.${crypto.randomUUID()}.restore`;
    try {
      const encrypted = fs.readFileSync(sourcePath);
      const suppliedRecoveryKey = typeof payload?.recoveryKey === "string" && payload.recoveryKey.length <= 128
        ? payload.recoveryKey.trim() : "";
      const decoded = decodeVerifiedBackup(encrypted, safeStorage, suppliedRecoveryKey || getOrCreateBackupRecoveryKey());
      const restoredBytes = decoded.bytes;
      if (restoredBytes.length < 1024) throw new Error("O backup selecionado esta vazio ou corrompido.");
      fs.writeFileSync(restoredTempPath, restoredBytes, { mode: 0o600, flag: "wx" });
      if (fs.existsSync(dbPath)) await runBackup(rollbackPath);
      const previousWorker = dbWorker;
      dbWorker = null;
      if (previousWorker) await previousWorker.terminate();
      fs.copyFileSync(restoredTempPath, dbPath);
      await startDbWorker();
      const check: any = await runQuery("get", "PRAGMA quick_check", []);
      const checkValue = String(check?.quick_check ?? Object.values(check || {})[0] ?? "").toLowerCase();
      if (checkValue !== "ok") throw new Error(`A validacao do backup falhou: ${checkValue || "resultado vazio"}`);
      if (fs.existsSync(restoredTempPath)) fs.unlinkSync(restoredTempPath);
      return { success: true, filePath: sourcePath, restoredAt: new Date().toISOString(), reloadRequired: true };
    } catch (error) {
      const failedWorker = dbWorker;
      dbWorker = null;
      if (failedWorker) {
        try { await failedWorker.terminate(); } catch { /* noop */ }
      }
      if (fs.existsSync(rollbackPath)) fs.copyFileSync(rollbackPath, dbPath);
      await startDbWorker();
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      if (fs.existsSync(restoredTempPath)) {
        try { fs.unlinkSync(restoredTempPath); } catch { /* noop */ }
      }
    }
  });
  app.on("before-quit", async (event) => {
    event.preventDefault();
    await backupDatabase();
    app.exit(0);
  });
  app.on("browser-window-created", (_, win) => {
    if (process.platform !== "darwin" && iconPath) win.setIcon(iconPath);
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
