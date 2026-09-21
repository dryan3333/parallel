import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import type { Task } from '../lib/types';
import { addDays, parseQuick, todayStr } from '../lib/util';
import { TaskRow } from '../components/TaskRow';
import { TaskDialog } from '../components/Dialogs';
import { Garden } from '../components/Garden';
import { ReminderCard } from '../components/ReminderCard';

const pref = (k: string, d: string) => { try { return localStorage.getItem('pxl.' + k) ?? d; } catch { return d; } };
const setPref = (k: string, v: string) => { try { localStorage.setItem('pxl.' + k, v); } catch { /* ignore */ } };

/* 首屏 = 收件箱 + 今天，抄 Todoist「今天」+ Linear「Inbox」：
   未读提醒在最上，逾期区可一键全部改到今天，任务行悬停有快捷操作，快速添加识别自然语言。 */
export function Today() {
  const { projects, clients, tasks, reminders, user, role, upsertTask, patchTask, toast, memberName } = useStore();
  const [edit, setEdit] = useState<Partial<Task> | null>(null);
  const [mine, setMine] = useState(pref('mine', role === 'owner' ? '0' : '1') === '1');
  const [showDone, setShowDone] = useState(false);
  const [showGarden, setShowGarden] = useState(pref('garden', '0') === '1');
  const [raw, setRaw] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !(e.target as HTMLElement)?.closest('input,textarea,[contenteditable]')) { e.preventDefault(); inputRef.current?.focus(); } };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  }, []);
  const t = todayStr(), week = addDays(t, 7);
  const ps = projects.filter(p => !p.archived); const cs = clients.filter(c => !c.archived);
  const isMine = (x: Task) => x.assignee_id === user?.id || (!x.assignee_id && x.created_by === user?.id);
  const all = mine ? tasks.filter(isMine) : tasks;
  const open = all.filter(x => x.status !== 'done');
  const over = open.filter(x => x.due && x.due < t).sort((a, b) => a.due!.localeCompare(b.due!));
  const today = open.filter(x => x.due === t).sort((a, b) => Number(b.priority === 'high') - Number(a.priority === 'high') || Number(b.status === 'doing') - Number(a.status === 'doing'));
  const doing = open.filter(x => x.status === 'doing' && !(x.due && x.due <= t));
  const soon = open.filter(x => x.due && x.due > t && x.due <= week && x.status !== 'doing').sort((a, b) => a.due!.localeCompare(b.due!));
  const nodate = open.filter(x => !x.due && x.status !== 'doing');
  const doneToday = all.filter(x => x.status === 'done' && x.done_at === t);
  const unread = reminders.filter(r => r.to_user === user?.id && !r.read);
  const d = new Date(); const wd = '日一二三四五六'[d.getDay()];
  const parsed = raw.trim() ? parseQuick(raw, ps, cs) : null;
  const quick = async (e: React.FormEvent) => {
    e.preventDefault(); if (!parsed || !parsed.title) return;
    const r = await upsertTask({ ...parsed, status: 'todo', note: '', assignee_id: user?.id || null });
    if (r) { setRaw(''); toast('已添加'); }
  };
  const rescheduleAll = async () => { for (const x of over) await patchTask(x.id, { due: t }); toast(`${over.length} 项已改到今天`); };
  const Sec = ({ name, list, cls, extra }: { name: string; list: Task[]; cls?: string; extra?: React.ReactNode }) => list.length ? (
    <div className="section"><h2 className={cls}>{name}<span className="n">{list.length}</span><span className="spacer" />{extra}</h2>
      <div className="tlist">{list.map(x => <TaskRow key={x.id} t={x} onEdit={setEdit} />)}</div></div>) : null;
  const hint = parsed && parsed.title ? [parsed.due ? (parsed.due === t ? '今天' : parsed.due === addDays(t, 1) ? '明天' : parsed.due.slice(5).replace('-', '/')) : '无日期', parsed.priority === 'high' ? 'P0' : null, parsed.project_id ? ps.find(p => p.id === parsed.project_id)?.name : null, parsed.client_id ? cs.find(c => c.id === parsed.client_id)?.name : null].filter(Boolean).join(' · ') : '';
  return (
    <>
      <div className="page-h"><h1>{d.getMonth() + 1} 月 {d.getDate()} 日，周{wd}</h1>
        <span className="sub">{unread.length ? <><span className="danger">{unread.length} 条未读提醒</span>，</> : null}{over.length ? <><span className="danger">{over.length} 项逾期</span>，</> : null}今天 {today.length} 项{doneToday.length ? `，已完成 ${doneToday.length}` : ''}</span>
        <span className="spacer" />
        <div className="chips"><button className={`chip ${!mine ? 'on' : ''}`} onClick={() => { setMine(false); setPref('mine', '0'); }}>全部</button><button className={`chip ${mine ? 'on' : ''}`} onClick={() => { setMine(true); setPref('mine', '1'); }}>只看我的</button></div>
      </div>

      {unread.length > 0 && <div className="section"><h2>收件箱<span className="n">{unread.length}</span><span className="spacer" /><a href="#inbox" className="btn sm ghost">全部提醒 →</a></h2>
        <div className="rlist">{unread.map(r => <ReminderCard key={r.id} r={r} />)}</div></div>}

      <form className="quick2" onSubmit={quick} autoComplete="off">
        <input ref={inputRef} type="text" value={raw} onChange={e => setRaw(e.target.value)} placeholder={`加任务给${memberName(user?.id) || '我'}：「明天 给客户发周报 !」「周五 #SE Lab 写 PRD」「@客户名 看 SEM」，按 n 聚焦`} />
        {hint && <span className="quick-hint mono">{hint}</span>}
        <button className="btn pri" type="submit" disabled={!parsed?.title}>添加</button>
      </form>

      <Sec name="已逾期" list={over} cls="over" extra={<button className="btn sm" onClick={rescheduleAll}>全部改到今天</button>} />
      <Sec name="今天" list={today} />
      <Sec name="进行中" list={doing} />
      <Sec name="未来 7 天" list={soon} />
      <Sec name="没有日期" list={nodate} />
      {!over.length && !today.length && !doing.length && !soon.length && !nodate.length && <div className="empty">今天清空了。加一条任务，或者去「客户」页巡检一圈。</div>}
      {doneToday.length > 0 && <div className="section"><h2 className="clickable" onClick={() => setShowDone(s => !s)}>{showDone ? '▾' : '▸'} 今天完成<span className="n">{doneToday.length}</span></h2>
        {showDone && <div className="tlist">{doneToday.map(x => <TaskRow key={x.id} t={x} onEdit={setEdit} />)}</div>}</div>}

      <div className="section"><h2 className="clickable" onClick={() => { setShowGarden(s => { setPref('garden', s ? '0' : '1'); return !s; }); }}>{showGarden ? '▾' : '▸'} 花园<span className="muted small" style={{ letterSpacing: 0, textTransform: 'none' }}>{ps.length} 个项目的进度</span></h2>
        {showGarden && <Garden projects={ps} tasks={tasks} />}</div>
      <TaskDialog task={edit} onClose={() => setEdit(null)} />
    </>
  );
}
