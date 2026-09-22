const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('parallelDesktop', {
  setBadge: (n) => ipcRenderer.send('badge', n),
  notify: (title, body) => ipcRenderer.send('notify', title, body),
});
