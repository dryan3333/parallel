const { app, BrowserWindow, shell, Notification, nativeImage, Menu, Tray } = require('electron');
const path = require('path');

const APP_URL = 'https://dryan3333.github.io/parallel/';
let win, tray;

function createWindow() {
  win = new BrowserWindow({
    width: 1180, height: 780, minWidth: 760, minHeight: 520,
    title: '平行线',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#F5F6F3',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  win.loadURL(APP_URL);
  // 外部链接（客户官网、GA、Ads）用系统浏览器开，不在壳里开
  win.webContents.setWindowOpenHandler(({ url }) => { if (!url.startsWith(APP_URL)) { shell.openExternal(url); return { action: 'deny' }; } return { action: 'allow' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(APP_URL)) { e.preventDefault(); shell.openExternal(url); } });
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.setIcon(nativeImage.createFromPath(path.join(__dirname, 'icon.png')));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '平行线', submenu: [{ role: 'about', label: '关于平行线' }, { type: 'separator' }, { role: 'hide', label: '隐藏' }, { role: 'quit', label: '退出' }] },
    { label: '编辑', submenu: [{ role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' }, { type: 'separator' }, { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' }, { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }] },
    { label: '视图', submenu: [{ role: 'reload', label: '刷新' }, { role: 'togglefullscreen', label: '全屏' }, { role: 'zoomIn', label: '放大' }, { role: 'zoomOut', label: '缩小' }, { role: 'resetZoom', label: '实际大小' }] },
    { label: '窗口', submenu: [{ role: 'minimize', label: '最小化' }, { role: 'close', label: '关闭' }] },
  ]));
  createWindow();
  try {
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 18, height: 18 }));
    tray.setToolTip('平行线');
    tray.on('click', () => { if (win) { win.show(); win.focus(); } else createWindow(); });
  } catch (e) { /* tray optional */ }
  app.on('activate', () => { if (!win) createWindow(); else win.show(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// 网页里 new Notification() 会走这里显示成系统通知；未读数通过 preload 设到 Dock 角标
const { ipcMain } = require('electron');
ipcMain.on('badge', (_e, n) => { try { app.setBadgeCount(Number(n) || 0); } catch (e) { /* ignore */ } });
ipcMain.on('notify', (_e, title, body) => { if (Notification.isSupported()) new Notification({ title, body }).show(); });
