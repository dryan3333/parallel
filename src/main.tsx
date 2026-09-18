import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { StoreProvider } from './state/store';
import { App } from './App';
import './styles.css';

const updateSW = registerSW({
  onNeedRefresh() {
    const bar = document.createElement('div');
    bar.className = 'update-bar';
    bar.innerHTML = '有新版本可用 <button>刷新</button>';
    bar.querySelector('button')!.onclick = () => updateSW(true);
    document.body.appendChild(bar);
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StoreProvider><App /></StoreProvider>
  </React.StrictMode>,
);
