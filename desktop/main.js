const { app, BrowserWindow, shell, Notification, nativeImage, Menu, Tray, ipcMain, globalShortcut, screen, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');

const APP_URL = 'https://dryan3333.github.io/parallel/';
const WIDGET_URL = APP_URL + '#widget';
const WIDGET_W = 380, WIDGET_H = 560;
const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const OFFLINE_PAGE = 'data:text/html;charset=utf-8,' + encodeURIComponent(
  '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>平行线</title></head>' +
  '<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#F5F6F3;color:#5b6159;font:15px -apple-system,BlinkMacSystemFont,\'Segoe UI\',\'PingFang SC\',\'Microsoft YaHei\',sans-serif">' +
  '连不上平行线，正在自动重试</body></html>');
const RETRY_DELAYS = [10, 20, 40, 60];

// 单实例：第二次双击只把已有窗口叫出来
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

try { app.setAppUserModelId('au.selabs.parallel'); } catch (e) { /* ignore */ }

let win = null, widget = null, tray = null, trayMenu = null, quitting = false;
let widgetHiddenAt = 0;

function alive(w) { return !!w && !w.isDestroyed(); }

function webPrefs() {
  return { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false };
}

function startHidden() {
  try {
    if (IS_WIN) return process.argv.includes('--hidden');
    if (IS_MAC) return !!app.getLoginItemSettings().wasOpenedAsHidden;
  } catch (e) { /* ignore */ }
  return false;
}

function loginItemOptions(on) {
  if (IS_WIN) return { openAtLogin: on, args: ['--hidden'] };
  return { openAtLogin: on, openAsHidden: true };
}

function isAutoStartOn() {
  try { return !!app.getLoginItemSettings(IS_WIN ? { args: ['--hidden'] } : undefined).openAtLogin; } catch (e) { return false; }
}

// 只在首次运行时打开一次开机自启；之后以用户在菜单里的选择为准
function ensureAutoStartOnce() {
  try {
    const mark = path.join(app.getPath('userData'), 'autostart-set');
    if (fs.existsSync(mark)) return;
    if (IS_WIN) {
      // 0.1.1 用默认名称写过一条不带 --hidden 的启动项，先清掉，避免开机时出现两条
      try { app.setLoginItemSettings({ openAtLogin: false, name: 'electron.app.' + app.getName() }); } catch (e) { /* ignore */ }
    }
    app.setLoginItemSettings(loginItemOptions(true));
    fs.mkdirSync(path.dirname(mark), { recursive: true });
    fs.writeFileSync(mark, new Date().toISOString());
  } catch (e) { /* ignore */ }
}

// 外部链接（客户官网、GA、Ads）用系统浏览器开，不在壳里开
function restrictNavigation(w) {
  w.webContents.setWindowOpenHandler(({ url }) => { if (!url.startsWith(APP_URL)) { shell.openExternal(url); return { action: 'deny' }; } return { action: 'allow' }; });
  w.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(APP_URL)) { e.preventDefault(); shell.openExternal(url); } });
}

// 断网或加载失败：显示一行提示，按 10、20、40、60 秒重试，之后每 60 秒一次
function attachRetry(w, url) {
  let timer = null, step = 0;
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
  w.webContents.on('did-fail-load', (_e, errorCode, _desc, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    if (typeof validatedURL === 'string' && validatedURL.startsWith('data:')) return;
    clear();
    const delay = RETRY_DELAYS[Math.min(step, RETRY_DELAYS.length - 1)];
    step += 1;
    if (alive(w)) w.loadURL(OFFLINE_PAGE).catch(() => {});
    timer = setTimeout(() => { timer = null; if (alive(w)) w.loadURL(url).catch(() => {}); }, delay * 1000);
  });
  w.webContents.on('did-finish-load', () => {
    let current = '';
    try { current = w.webContents.getURL(); } catch (e) { /* ignore */ }
    if (current.startsWith(APP_URL)) { clear(); step = 0; }
  });
  w.on('closed', clear);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180, height: 780, minWidth: 760, minHeight: 520,
    title: '平行线',
    show: !startHidden(),
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'default',
    backgroundColor: '#F5F6F3',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: webPrefs(),
  });
  restrictNavigation(win);
  attachRetry(win, APP_URL);
  win.loadURL(APP_URL).catch(() => {});
  // 关窗口不退出：缩到 Dock / 托盘继续收提醒；真正退出走菜单「退出」
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
  win.on('closed', () => { win = null; });
  return win;
}

function showMain() {
  if (!alive(win)) { createWindow(); }
  if (!alive(win)) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWidget() {
  widget = new BrowserWindow({
    width: WIDGET_W, height: WIDGET_H,
    frame: false, resizable: false, show: false, skipTaskbar: true, alwaysOnTop: true,
    minimizable: false, maximizable: false, fullscreenable: false,
    title: '平行线',
    backgroundColor: '#F5F6F3',
    webPreferences: webPrefs(),
  });
  restrictNavigation(widget);
  attachRetry(widget, WIDGET_URL);
  widget.loadURL(WIDGET_URL).catch(() => {});
  widget.on('blur', () => { if (alive(widget) && widget.isVisible()) { widgetHiddenAt = Date.now(); widget.hide(); } });
  widget.on('close', (e) => { if (!quitting) { e.preventDefault(); widget.hide(); } });
  widget.on('closed', () => { widget = null; });
  return widget;
}

function clamp(v, min, max) { return Math.max(min, Math.min(v, Math.max(min, max))); }

function positionWidget() {
  if (!alive(widget)) return;
  let b = null;
  try { b = tray ? tray.getBounds() : null; } catch (e) { b = null; }
  let x, y, area;
  if (!b || !b.width) {
    area = screen.getPrimaryDisplay().workArea;
    x = area.x + area.width - WIDGET_W - 12;
    y = area.y + 12;
  } else {
    area = screen.getDisplayMatching(b).workArea;
    if (IS_MAC) {
      x = Math.round(b.x + b.width / 2 - WIDGET_W / 2);
      y = Math.round(b.y + b.height + 4);
    } else {
      x = Math.round(b.x + b.width - WIDGET_W);
      y = Math.round(b.y - WIDGET_H - 4);
    }
  }
  x = clamp(x, area.x, area.x + area.width - WIDGET_W);
  y = clamp(y, area.y, area.y + area.height - WIDGET_H);
  widget.setBounds({ x, y, width: WIDGET_W, height: WIDGET_H });
}

function showWidget() {
  if (!alive(widget)) createWidget();
  if (!alive(widget)) return;
  positionWidget();
  widget.show();
  widget.focus();
}

function toggleWidget() {
  if (alive(widget) && widget.isVisible()) { widget.hide(); return; }
  // 点托盘图标时小窗会先因失焦被收起，这一下点击不应再把它打开
  if (Date.now() - widgetHiddenAt < 300) return;
  showWidget();
}

function quickAdd() {
  showWidget();
  if (!alive(widget)) return;
  const wc = widget.webContents;
  const send = () => { try { if (alive(widget)) widget.webContents.send('quick-add'); } catch (e) { /* ignore */ } };
  if (wc.isLoading()) wc.once('did-finish-load', send); else send();
}

function registerShortcut() {
  for (const acc of ['CommandOrControl+Shift+Space', 'Alt+Shift+N']) {
    try { if (globalShortcut.register(acc, quickAdd)) return; } catch (e) { /* 试下一个 */ }
  }
}

app.on('second-instance', () => { if (app.isReady()) showMain(); });
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch (e) { /* ignore */ } });

app.whenReady().then(() => {
  if (!gotLock) return;
  ensureAutoStartOnce();
  if (IS_MAC) app.dock.setIcon(nativeImage.createFromPath(path.join(__dirname, 'icon.png')));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '平行线', submenu: [{ role: 'about', label: '关于平行线' }, { type: 'separator' },
      { label: '开机自动启动', type: 'checkbox', checked: isAutoStartOn(), click: (item) => { try { app.setLoginItemSettings(loginItemOptions(item.checked)); } catch (e) { /* ignore */ } } },
      { type: 'separator' }, { role: 'hide', label: '隐藏' }, { role: 'quit', label: '退出' }] },
    { label: '编辑', submenu: [{ role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' }, { type: 'separator' }, { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' }, { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }] },
    { label: '视图', submenu: [{ role: 'reload', label: '刷新' }, { role: 'togglefullscreen', label: '全屏' }, { role: 'zoomIn', label: '放大' }, { role: 'zoomOut', label: '缩小' }, { role: 'resetZoom', label: '实际大小' }] },
    { label: '窗口', submenu: [{ role: 'minimize', label: '最小化' }, { role: 'close', label: '关闭' }] },
  ]));
  createWindow();
  try {
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 18, height: 18 }));
    tray.setToolTip('平行线');
    trayMenu = Menu.buildFromTemplate([
      { label: '快速记一条', click: quickAdd },
      { label: '打开完整窗口', click: showMain },
      { type: 'separator' },
      { label: '退出', click: () => { quitting = true; app.quit(); } },
    ]);
    tray.on('click', toggleWidget);
    tray.on('right-click', () => tray.popUpContextMenu(trayMenu));
  } catch (e) { /* tray optional */ }
  try { createWidget(); } catch (e) { /* 小窗可选 */ }
  registerShortcut();
  try {
    // 合盖再打开后网络通常要几秒才恢复
    powerMonitor.on('resume', () => {
      setTimeout(() => {
        if (!alive(win)) return;
        try {
          if (win.webContents.getURL().startsWith(APP_URL)) win.webContents.reload();
          else win.loadURL(APP_URL).catch(() => {});
        } catch (e) { /* ignore */ }
      }, 5000);
    });
  } catch (e) { /* ignore */ }
  app.on('activate', showMain);
});
app.on('window-all-closed', () => { /* 保持后台运行以接收提醒 */ });

// 未读与待办数：macOS 设到 Dock 角标和菜单栏，Windows 设到任务栏图标右下角
ipcMain.on('badge', (_e, n, icon) => {
  const count = Math.max(0, Math.floor(Number(n)) || 0);
  try {
    if (IS_MAC) {
      app.setBadgeCount(count);
      if (tray) tray.setTitle(count > 0 ? String(count) : '');
    } else if (IS_WIN) {
      const ok = typeof icon === 'string' && icon.startsWith('data:image/png;base64,') && icon.length < 200000;
      if (alive(win)) {
        if (ok && count > 0) win.setOverlayIcon(nativeImage.createFromDataURL(icon), `${count} 项待办`);
        else win.setOverlayIcon(null, '');
      }
    }
  } catch (e) { /* ignore */ }
  try { if (tray) tray.setToolTip(count > 0 ? `平行线 · 今天 ${count} 件` : '平行线'); } catch (e) { /* ignore */ }
});

// 主窗口和小窗可能各报一次同样的通知：相同标题和内容 5 秒内只显示一次
const recentNotes = new Map();
function isRepeat(key) {
  const now = Date.now();
  for (const [k, at] of recentNotes) { if (now - at > 5000) recentNotes.delete(k); }
  if (recentNotes.has(key)) return true;
  recentNotes.set(key, now);
  return false;
}

ipcMain.on('notify', (_e, title, body) => {
  try {
    if (!Notification.isSupported()) return;
    const tt = String(title ?? '').slice(0, 200), bb = String(body ?? '').slice(0, 200);
    if (isRepeat(tt + '\n' + bb)) return;
    const n = new Notification({ title: tt, body: bb });
    n.on('click', () => {
      try {
        showMain();
        if (alive(win)) win.webContents.executeJavaScript("location.hash='#today'").catch(() => {});
      } catch (e) { /* ignore */ }
    });
    n.show();
  } catch (e) { /* ignore */ }
});

ipcMain.on('open-main', (_e, hash) => {
  try {
    showMain();
    if (alive(widget)) widget.hide();
    // 小窗里点了客户或项目链接：让主窗口跳过去。只接受 #today、#c/<id> 这类形式
    if (typeof hash === 'string' && hash.length < 80 && /^#[a-z]+(\/[0-9a-f-]+)?$/.test(hash) && hash !== '#widget' && alive(win)) {
      const wc = win.webContents;
      const go = () => { try { if (alive(win)) win.webContents.executeJavaScript('location.hash=' + JSON.stringify(hash)).catch(() => {}); } catch (e) { /* ignore */ } };
      if (wc.isLoading()) wc.once('did-finish-load', go); else go();
    }
  } catch (e) { /* ignore */ }
});
