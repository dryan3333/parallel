const { contextBridge, ipcRenderer } = require('electron');

// 快捷键可能在页面挂上监听之前就到了，先记着，等页面注册后补发
const quickAddCbs = [];
let quickAddPending = false;
ipcRenderer.on('quick-add', () => {
  if (!quickAddCbs.length) { quickAddPending = true; return; }
  quickAddCbs.forEach((cb) => { try { cb(); } catch (e) { /* ignore */ } });
});

contextBridge.exposeInMainWorld('parallelDesktop', {
  setBadge: (n, icon) => ipcRenderer.send('badge', n, icon),
  notify: (title, body) => ipcRenderer.send('notify', title, body),
  onQuickAdd: (cb) => {
    if (typeof cb !== 'function') return;
    quickAddCbs.push(cb);
    if (quickAddPending) { quickAddPending = false; setTimeout(() => { try { cb(); } catch (e) { /* ignore */ } }, 0); }
  },
  openMain: (hash) => ipcRenderer.send('open-main', typeof hash === 'string' ? hash : ''),
  version: '0.1.2',
});
