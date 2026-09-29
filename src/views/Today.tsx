import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import type { Task } from '../lib/types';
import { addDays, lastLogDate, matchFullName, parseQuick, todayStr } from '../lib/util';
const lastLogDateSafe = (log: string) => !!lastLogDate(log || '');
import { TaskRow } from '../components/TaskRow';
import { TaskDialog } from '../components/Dialogs';
import { Garden } from '../components/Garden';
import { ReminderCard } from '../components/ReminderCard';

const pref = (k: string, d: string) => { try { return localStorage.getItem('pxl.' + k) ?? d; } catch { return d; } };
const setPref = (k: string, v: string) => { try { localStorage.setItem('pxl.' + k, v); } catch { /* ignore */ } };

const finePointer = (() => { try { return window.matchMedia('(pointer: fine)').matches; } catch { return false; } })();

/* 首屏 = 输入框 + 今天，抄 Todoist「今天」+ Linear「Inbox」：
   日期和输入框在最上，之前留下的事并入「今天」不标红，设置清单折叠在下方。
   compact 是桌面小窗（#widget）用的紧凑视图。 */
export function Today({ compact }: { compact?: boolean } = {}) {
  const { projects, clients, tasks, reminders, user, role, upsertTask, patchTask, upsertClient, canEdit, toast, routines, members, today: t } = useStore();
  const [edit, setEdit] = useState<Partial<Task> | null>(null);
  const [minePref, setMine] = useState(pref('mine', '1') === '1');
  const mine = compact || minePref;
  const [focused, setFocused] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [stepsOff, setStepsOff] = useState(pref('steps', '1') !== '1');
  const [mhintOff, setMhintOff] = useState(pref('mhint', '1') !== '1');
  const [showDone, setShowDone] = useState(false);
  const [showGarden, setShowGarden] = useState(pref('garden', '0') === '1');
  const [raw, setRaw] = useState('');
  const [sug, setSug] = useState<{ id: string; word: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [backfillOff, setBackfillOff] = useState(pref('backfill', '') === todayStr());
  useEffect(() => { if (!sug) return; const h = setTimeout(() => setSug(null), 15000); return () => clearTimeout(h); }, [sug]);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const f = () => { const el = inputRef.current; if (!el) return; el.focus(); el.select(); };
    window.addEventListener('pxl:quick-add', f); return () => window.removeEventListener('pxl:quick-add', f);
  }, []);
  const week = addDays(t, 7);
  const ps = projects.filter(p => !p.archived); const cs = clients.filter(c => !c.archived);
  const isMine = (x: Task) => x.assignee_id === user?.id || (!x.assignee_id && x.created_by === user?.id);
  const all = mine ? tasks.filter(isMine) : tasks;
  const open = all.filter(x => x.status !== 'done');
  const todayList = open.filter(x => x.due && x.due <= t).sort((a, b) => Number(b.priority === 'high') - Number(a.priority === 'high') || Number(b.status === 'doing') - Number(a.status === 'doing') || Number(b.due === t) - Number(a.due === t) || a.due!.localeCompare(b.due!));
  const carried = todayList.filter(x => x.due! < t).length;
  const doing = open.filter(x => x.status === 'doing' && !(x.due && x.due <= t));
  const soon = open.filter(x => x.due && x.due > t && x.due <= week && x.status !== 'doing').sort((a, b) => a.due!.localeCompare(b.due!));
  const nodate = open.filter(x => !x.due && x.status !== 'doing');
  const doneToday = all.filter(x => x.status === 'done' && x.done_at === t);
  const unread = reminders.filter(r => r.to_user === user?.id && !r.read);
  const d = new Date(t + 'T00:00:00'); const wd = '日一二三四五六'[d.getDay()];
  const people = members.filter(m => m.user_id !== user?.id).map(m => ({ id: m.user_id, name: (m.display_name || '').trim() || (m.email || '').split('@')[0] }));
  const parsed = raw.trim() ? parseQuick(raw, ps.filter(p => canEdit(p.id)), cs, people) : null;
  const steps: [boolean, string, string][] = [
    [cs.length > 0, '建第一个客户', '#clients'],
    [ps.some(p => p.type === 'ops' && p.client_id), '把运营线 campaign 挂到客户上（项目 → 设置 → 所属客户）', '#projects'],
    [members.length > 1, '邀请 Miranda 加入', '#members'],
    [routines.some(r => r.active && r.kind === 'task'), '给她设每天的巡检例行任务', '#inbox'],
    [cs.some(c => lastLogDateSafe(c.log)), '在客户页记第一笔日志', '#clients'],
  ];
  const stepsDone = steps.filter(s => s[0]).length;
  const showSteps = !compact && role === 'owner' && stepsDone < steps.length && !stepsOff;
  const ownerM = members.find(m => m.role === 'owner');
  const ownerName = ownerM ? ((ownerM.display_name || '').trim() || (ownerM.email || '').split('@')[0]) : '';
  const showMhint = !compact && role === 'member' && !mhintOff && !!user && !tasks.some(x => x.status === 'done' && isMine(x));
  const openMain = (e: React.MouseEvent) => { const f = window.parallelDesktop?.openMain; if (typeof f === 'function') { e.preventDefault(); window.parallelDesktop!.openMain!(); } };
  const quick = async (e: React.FormEvent) => {
    e.preventDefault(); if (!parsed || !parsed.title) return;
    const who = parsed.assignee_id ? people.find(p => p.id === parsed.assignee_id) : null;
    setSug(null);
    const r = await upsertTask({ ...parsed, status: 'todo', note: '', assignee_id: parsed.assignee_id || user?.id || null });
    if (!r) return;
    setRaw(''); toast(who ? `已派给 ${who.name}` : '已添加');
    if (!r.client_id && !r.project_id && cs.length <= 6) {
      const w = r.title.split(/\s+/)[0] || '';
      const known = [...clients, ...projects].some(x => x.name.toLowerCase().includes(w.toLowerCase())) || members.some(m => (m.display_name || '').toLowerCase().includes(w.toLowerCase()) || (m.email || '').split('@')[0].toLowerCase() === w.toLowerCase());
      const word = /^[A-Za-z][A-Za-z0-9&.-]{3,}$/.test(w) && !known ? w : null;
      if (cs.length || word) setSug({ id: r.id, word });
    }
  };
  const assignTo = async (clientId: string, name: string) => {
    if (!sug || busy) return; setBusy(true);
    const ok = await patchTask(sug.id, { client_id: clientId });
    setBusy(false); if (ok) { toast(`已归到 ${name}`); setSug(null); }
  };
  const createAndAssign = async () => {
    if (!sug?.word || busy) return; setBusy(true);
    const name = sug.word[0].toUpperCase() + sug.word.slice(1);
    const c = await upsertClient({ name, stage: 'lead', channels: [] });
    if (c) { const ok = await patchTask(sug.id, { client_id: c.id }); if (ok) toast(`已建客户 ${c.name} 并归属`); setSug(null); }
    setBusy(false);
  };
  const orphan = sug || backfillOff ? [] : tasks.filter(x => x.status !== 'done' && !x.client_id && isMine(x))
    .map(x => ({ x, c: matchFullName(x.title, cs) })).filter((o): o is { x: Task; c: NonNullable<typeof o.c> } => !!o.c);
  const backfill = async () => {
    if (busy) return; setBusy(true); let n = 0;
    for (const o of orphan) { if (await patchTask(o.x.id, { client_id: o.c.id })) n++; }
    setBusy(false); toast(`${n} 条已归属`);
  };
  const closeBackfill = () => { setPref('backfill', todayStr()); setBackfillOff(true); };
  const Sec = ({ name, list, cls, extra }: { name: string; list: Task[]; cls?: string; extra?: React.ReactNode }) => list.length ? (
    <div className="section"><h2 className={cls}>{name}<span className="n">{list.length}</span><span className="spacer" />{extra}</h2>
      <div className="tlist">{list.map(x => <TaskRow key={x.id} t={x} onEdit={setEdit} />)}</div></div>) : null;
  const hint = parsed && parsed.title ? [parsed.due ? (parsed.due === t ? '今天' : parsed.due === addDays(t, 1) ? '明天' : parsed.due.slice(5).replace('-', '/')) : '无日期', parsed.priority === 'high' ? 'P0' : null, parsed.project_id ? ps.find(p => p.id === parsed.project_id)?.name : null, parsed.client_id ? cs.find(c => c.id === parsed.client_id)?.name : null, parsed.assignee_id ? '派给 ' + (people.find(p => p.id === parsed.assignee_id)?.name || '') : null].filter(Boolean).join(' · ') : '';
  const examples = ['明天给客户发周报', '周五 Jarvis 看 SEM 花费', ...(people[0] ? [`给${people[0].name} 查评价`] : [])].join(' / ');
  return (
    <>
      <div className="page-h"><h1>{d.getMonth() + 1} 月 {d.getDate()} 日，周{wd}</h1>
        <span className="sub">{unread.length ? <><span className="danger">{unread.length} 条未读提醒</span>，</> : null}今天 {todayList.length} 项{carried ? <span className="muted">，{carried} 项是之前留下的</span> : null}{doneToday.length ? `，已完成 ${doneToday.length}` : ''}</span>
        {!compact && <><span className="spacer" />
          <div className="chips"><button className={`chip ${!mine ? 'on' : ''}`} onClick={() => { setMine(false); setPref('mine', '0'); }}>全部</button><button className={`chip ${mine ? 'on' : ''}`} onClick={() => { setMine(true); setPref('mine', '1'); }}>只看我的</button></div></>}
      </div>

      <form className="quick2" onSubmit={quick} autoComplete="off">
        <input ref={inputRef} type="text" value={raw} onChange={e => setRaw(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholder="记一件事，回车添加" autoFocus={finePointer} />
        {hint && <span className="quick-hint mono">{hint}</span>}
        <button className="btn pri" type="submit" disabled={!parsed?.title}>添加</button>
      </form>
      {focused && !raw && !sug && !orphan.length && <div className="quick-suggest quick-eg">可以直接写：{examples}</div>}
      {sug ? <div className="quick-suggest"><span>归到客户：</span>
        {cs.map(c => <button key={c.id} type="button" className="chip" disabled={busy} onClick={() => assignTo(c.id, c.name)}>{c.name}</button>)}
        {sug.word && <button type="button" className="btn sm" disabled={busy} onClick={createAndAssign}>把 {sug.word} 建为客户</button>}
        <span className="spacer" /><button type="button" className="btn sm ghost" aria-label="关闭" onClick={() => setSug(null)}>×</button></div>
        : orphan.length > 0 ? <div className="quick-suggest"><span>有 {orphan.length} 条任务标题里提到了客户，还没归属</span>
          <button type="button" className="btn sm" disabled={busy} onClick={backfill}>一键归属</button>
          <span className="spacer" /><button type="button" className="btn sm ghost" aria-label="关闭" onClick={closeBackfill}>×</button></div> : null}

      {unread.length > 0 && <div className="section"><h2>收件箱<span className="n">{unread.length}</span><span className="spacer" /><a href="#inbox" className="btn sm ghost" onClick={compact ? openMain : undefined}>全部提醒 →</a></h2>
        <div className="rlist">{unread.map(r => <ReminderCard key={r.id} r={r} />)}</div></div>}

      {showMhint && <div className="steps mhint"><div className="hd"><b>怎么用</b><span className="spacer" /><button className="btn sm ghost" onClick={() => { setPref('mhint', '0'); setMhintOff(true); }}>知道了</button></div>
        <p>这里是 {ownerName} 交给你的事。</p>
        <p>任务下面有客户的链接，看完在输入框写一句，回车就算完成。</p>
        <p>完成后 {ownerName} 会自动收到通知，不用再去微信说一遍。</p></div>}
      <Sec name="今天" list={todayList} />
      <Sec name="进行中" list={doing} />
      {compact ? <>
        {!todayList.length && !doing.length && <div className="empty">今天没有待办。在上面记一件事，回车就行。</div>}
        <div className="widget-foot"><a href="#today" onClick={openMain}>打开完整窗口</a></div>
      </> : <>
        <Sec name="未来 7 天" list={soon} />
        <Sec name="没有日期" list={nodate} />
        {!todayList.length && !doing.length && !soon.length && !nodate.length && <div className="empty">今天没有待办。在上面记一件事，回车就行。</div>}
        {doneToday.length > 0 && <div className="section"><h2 className="clickable" onClick={() => setShowDone(s => !s)}>{showDone ? '▾' : '▸'} 今天完成<span className="n">{doneToday.length}</span></h2>
          {showDone && <div className="tlist">{doneToday.map(x => <TaskRow key={x.id} t={x} onEdit={setEdit} />)}</div>}</div>}

        {showSteps && <div className="section"><h2 className="clickable" onClick={() => setShowSetup(s => !s)}>{showSetup ? '▾' : '▸'} 设置清单 {stepsDone}/{steps.length}<span className="spacer" />{showSetup && <button className="btn sm ghost" onClick={e => { e.stopPropagation(); setPref('steps', '0'); setStepsOff(true); }}>不再显示</button>}</h2>
          {showSetup && <div className="steps"><div className="step-list">{steps.map(([ok, label, href], i) => <a key={i} href={href} className={`step-item ${ok ? 'ok' : ''}`}><span className={`cb ${ok ? 'on' : ''}`} /> {label}</a>)}</div></div>}</div>}

        <div className="section"><h2 className="clickable" onClick={() => { setShowGarden(s => { setPref('garden', s ? '0' : '1'); return !s; }); }}>{showGarden ? '▾' : '▸'} 花园<span className="muted small" style={{ letterSpacing: 0, textTransform: 'none' }}>{ps.length} 个项目的进度</span></h2>
          {showGarden && <Garden projects={ps} tasks={tasks} />}</div>
      </>}
      <TaskDialog task={edit} onClose={() => setEdit(null)} />
    </>
  );
}
