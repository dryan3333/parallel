import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { StoreProvider } from './state/store';
import { App } from './App';
import './styles.css';

const UPDATED_KEY = 'pxl.updated';
const CHECK_EVERY = 30 * 60 * 1000;   // 每 30 分钟问一次有没有新版本
const IDLE_RETRY = 20 * 1000;         // 有新版本但用户正忙时，每 20 秒再看一眼
const RELOAD_GUARD = 60 * 1000;       // 60 秒内自动刷新过就不再自动刷，防止循环

// 正在输入且已有内容：此时刷新会丢字
function typing(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value.trim() !== '';
  if (el.isContentEditable) return (el.textContent ?? '').trim() !== '';
  return false;
}

// Modal 组件用原生 <dialog>，打开时带 open 属性
function idle(): boolean {
  if (document.hidden) return true;
  return !typing() && !document.querySelector('dialog[open]');
}

function recentlyReloaded(): boolean {
  try {
    const t = Number(sessionStorage.getItem(UPDATED_KEY) || 0);
    return t > 0 && Date.now() - t < RELOAD_GUARD;
  } catch { return false; }
}

function applyUpdate() {
  try { sessionStorage.setItem(UPDATED_KEY, String(Date.now())); } catch { /* 隐私模式下忽略 */ }
  void updateSW(true);
}

function tryAutoUpdate(): boolean {
  if (recentlyReloaded() || !idle()) return false;
  applyUpdate();
  return true;
}

let barShown = false;
function showBar() {
  if (barShown) return;
  barShown = true;
  const bar = document.createElement('div');
  bar.className = 'update-bar';
  bar.innerHTML = '有新版本，空闲时会自动更新 <button>刷新</button>';
  bar.querySelector('button')!.onclick = applyUpdate;
  document.body.appendChild(bar);
}

let waiting = false;
const updateSW = registerSW({
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const check = async () => {
      try { await reg.update(); } catch { /* 离线或网络失败，下次再查 */ }
    };
    setInterval(check, CHECK_EVERY);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void check(); });
  },
  onNeedRefresh() {
    if (tryAutoUpdate()) return;
    showBar();
    if (waiting) return;
    waiting = true;
    const timer = setInterval(() => { if (tryAutoUpdate()) clearInterval(timer); }, IDLE_RETRY);
    document.addEventListener('visibilitychange', () => { if (tryAutoUpdate()) clearInterval(timer); });
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StoreProvider><App /></StoreProvider>
  </React.StrictMode>,
);
