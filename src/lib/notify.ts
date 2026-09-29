// 系统通知的统一出口：桌面壳优先，其次浏览器已授权的通知；都不行就安静地什么都不做
export type ParallelDesktop = {
  setBadge(n: number, icon?: string): void;
  notify(title: string, body: string): void;
  onQuickAdd?(cb: () => void): void;
  openMain?(hash?: string): void;
  version?: string;
};

// 桌面小窗（#widget）和主窗口跑的是同一套代码。以首次加载时的 hash 为准，之后不变。
// 小窗不发系统通知、不做通知去重标记，全部交给主窗口，避免同一条提醒弹两次。
export const IS_WIDGET: boolean = (() => { try { return location.hash.startsWith('#widget'); } catch { return false; } })();
declare global {
  interface Window { parallelDesktop?: ParallelDesktop }
}

export const isDesktop = (): boolean => { try { return !!window.parallelDesktop; } catch { return false; } };

export async function notify(title: string, body: string): Promise<void> {
  if (IS_WIDGET) return;
  try {
    const d = window.parallelDesktop;
    if (d && typeof d.notify === 'function') { d.notify(title, body); return; }
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) { await reg.showNotification(title, { body }); return; }
    } catch { /* 换下一种方式 */ }
    try { new Notification(title, { body }); } catch { /* ignore */ }
  } catch { /* ignore */ }
}
