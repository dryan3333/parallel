import { useEffect, useMemo, useRef } from 'react';
import { useStore } from '../state/store';
import type { Task } from './types';
import { notify } from './notify';
import { todayStr } from './util';

// 「我的待办」：没做完、归我（指派给我，或没指派且是我建的）、到期日是今天或更早
export const isMyTodo = (t: Task, uid: string, today: string): boolean =>
  t.status !== 'done' && (t.assignee_id === uid || (!t.assignee_id && t.created_by === uid)) && !!t.due && t.due <= today;

export const myTodos = (tasks: Task[], uid: string, today: string): Task[] =>
  tasks.filter(t => isMyTodo(t, uid, today)).sort((a, b) => {
    const p = (b.priority === 'high' ? 1 : 0) - (a.priority === 'high' ? 1 : 0);
    if (p) return p;
    return (b.due === today ? 1 : 0) - (a.due === today ? 1 : 0);
  });

export const digestBody = (todos: Task[], unread: number, today: string): string => {
  const n = todos.length; const m = todos.filter(t => !!t.due && t.due < today).length;
  let s = '';
  if (n > 0) s = m > 0 ? `今天 ${n} 件事，其中 ${m} 件是之前留下的：${todos[0].title}` : `今天 ${n} 件事：${todos[0].title}`;
  if (unread > 0) s = s ? `${s}，另有 ${unread} 条未读提醒` : `有 ${unread} 条未读提醒`;
  return s;
};

const badgeIcon = (n: number): string => {
  if (n <= 0) return '';
  try {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d'); if (!g) return '';
    g.fillStyle = '#D14B3D'; g.beginPath(); g.arc(32, 32, 32, 0, Math.PI * 2); g.fill();
    const text = n > 9 ? '9+' : String(n);
    g.fillStyle = '#fff'; g.font = `bold ${n > 9 ? 34 : 42}px -apple-system, "Segoe UI", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 32, 35);
    return c.toDataURL('image/png');
  } catch { return ''; }
};

const DIGEST_KEY = 'pxl.digest';

export function useNudges() {
  const { user, wsId, loaded, tasks, reminders, today } = useStore();
  const uid = user?.id || '';
  const active = !!uid && !!wsId && loaded;
  const todos = useMemo(() => (active ? myTodos(tasks, uid, today) : []), [active, tasks, uid, today]);
  const unread = useMemo(() => (active ? reminders.filter(r => r.to_user === uid && !r.read).length : 0), [active, reminders, uid]);
  const n = todos.length + unread;

  // 角标和标题
  useEffect(() => {
    try { document.title = n > 0 ? `(${n}) 平行线` : '平行线'; } catch { /* ignore */ }
    try { window.parallelDesktop?.setBadge(n, badgeIcon(n)); } catch { /* ignore */ }
  }, [n]);

  // 每日摘要：8:30 以后当天第一次检查时发一条
  const sentRef = useRef('');
  const latest = useRef({ tasks, reminders, uid });
  latest.current = { tasks, reminders, uid };
  useEffect(() => {
    if (!active) return;
    const check = () => {
      const now = new Date();
      if (now.getHours() * 60 + now.getMinutes() < 8 * 60 + 30) return;
      const t = todayStr();
      let sent = false;
      try { sent = localStorage.getItem(DIGEST_KEY) === t; } catch { /* 读不到按没发过算 */ }
      if (sent || sentRef.current === t) return;
      sentRef.current = t;
      try { localStorage.setItem(DIGEST_KEY, t); } catch { /* ignore */ }
      const cur = latest.current;
      const list = myTodos(cur.tasks, cur.uid, t);
      const k = cur.reminders.filter(r => r.to_user === cur.uid && !r.read).length;
      if (list.length === 0 && k === 0) return;
      notify('平行线', digestBody(list, k, t));
    };
    check();
    const timer = window.setInterval(check, 60000);
    return () => window.clearInterval(timer);
  }, [active, uid]);
}
