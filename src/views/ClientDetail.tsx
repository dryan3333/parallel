import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import type { Client, Task } from '../lib/types';
import { CHANNEL_LABEL, STAGE_LABEL, appendLog, fmtDue, lastLogDate, todayStr } from '../lib/util';
import { Stepper } from '../components/Stepper';
import { TaskRow } from '../components/TaskRow';
import { ClientDialog } from '../components/ClientDialog';
import { ProjectDialog, TaskDialog } from '../components/Dialogs';

type Item = { key: string; date: string; time?: string; kind: 'log' | 'task' | 'done' | 'campaign'; text: string; task?: Task; href?: string };

/* 客户页抄 HubSpot 联系人页：左栏固定档案，右栏一条时间线（日志 / 任务 / 完成 / campaign 混排），顶部一个输入框既能记日志也能加任务 */
export function ClientDetail({ id }: { id: string }) {
  const { clients, projects, tasks, user, memberName, patchClient, upsertTask, toast } = useStore();
  const c = clients.find(x => x.id === id);
  const [setting, setSetting] = useState(false); const [newCamp, setNewCamp] = useState(false);
  const [edit, setEdit] = useState<Partial<Task> | null>(null);
  const [mode, setMode] = useState<'log' | 'task'>('log');
  const [entry, setEntry] = useState(''); const [note, setNote] = useState(''); const [hint, setHint] = useState('');
  const [showOpen, setShowOpen] = useState(true);
  const timer = useRef<number | undefined>(undefined); const lastSaved = useRef('');
  useEffect(() => { if (c && c.note !== lastSaved.current && document.activeElement?.id !== 'cnote') { setNote(c.note || ''); lastSaved.current = c.note || ''; } }, [c?.note]); // eslint-disable-line
  const camps = useMemo(() => projects.filter(p => p.client_id === id && !p.archived), [projects, id]);
  const mine = useMemo(() => tasks.filter(x => x.client_id === id || camps.some(p => p.id === x.project_id)), [tasks, id, camps]);
  const timeline = useMemo<Item[]>(() => {
    if (!c) return [];
    const items: Item[] = [];
    let cur = ''; for (const line of (c.log || '').split('\n')) { const m = line.match(/^## (\d{4}-\d{2}-\d{2})/); if (m) { cur = m[1]; continue; } const b = line.match(/^- (.+)/); if (b && cur) items.push({ key: 'l' + items.length, date: cur, kind: 'log', text: b[1] }); }
    for (const t of mine) {
      items.push({ key: 'c' + t.id, date: t.created_at.slice(0, 10), time: t.created_at.slice(11, 16), kind: 'task', text: t.title, task: t });
      if (t.status === 'done' && t.done_at) items.push({ key: 'd' + t.id, date: t.done_at, kind: 'done', text: t.title, task: t });
    }
    for (const p of camps) items.push({ key: 'p' + p.id, date: p.created_at.slice(0, 10), kind: 'campaign', text: `新建 campaign「${p.name}」`, href: `#p/${p.id}` });
    return items.sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
  }, [c, mine, camps]);
  if (!c) return <div className="empty">客户不存在或已删除。<a href="#clients">返回客户列表</a></div>;
  const open = mine.filter(x => x.status !== 'done').sort((a, b) => ((a.due || '9') < (b.due || '9') ? -1 : 1));
  const last = lastLogDate(c.log); const t = todayStr();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); const v = entry.trim(); if (!v) return;
    if (mode === 'log') { const ok = await patchClient(id, { log: appendLog(c.log || '', v) }); if (ok) { setEntry(''); toast('已记一笔'); } }
    else { const r = await upsertTask({ title: v, client_id: id, due: t, status: 'todo', priority: 'normal', note: '', assignee_id: user?.id || null }); if (r) { setEntry(''); toast('已加任务'); } }
  };
  const onNote = (v: string) => {
    setNote(v); setHint('输入中…'); window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => { lastSaved.current = v; const ok = await patchClient(id, { note: v }); setHint(ok ? '已保存' : '保存失败'); }, 800);
  };
  const groups: [string, Item[]][] = []; for (const it of timeline) { const g = groups[groups.length - 1]; if (g && g[0] === it.date) g[1].push(it); else groups.push([it.date, [it]]); }
  const dayLabel = (d: string) => d === t ? '今天' : fmtDue(d);
  return (
    <>
      <div className="ph" style={{ marginBottom: 12 }}>
        <div className="row"><a href="#clients" className="btn sm ghost">← 客户</a><span className="tag ops">{STAGE_LABEL(c.stage)}</span>
          <span className={`muted small ${last === t ? 'ok' : ''}`}>{last === t ? '今天已巡检' : last ? `上次日志 ${last.slice(5).replace('-', '/')}` : '还没有日志'}</span>
          <span className="spacer" /><button className="btn sm" onClick={() => setSetting(true)}>设置</button><button className="btn sm" onClick={() => setNewCamp(true)}>+ campaign</button></div>
        <h1>{c.name}</h1>
      </div>
      <div className="crm">
        <aside className="crm-side">
          <div className="panel"><div className="bd crm-facts">
            <div><span className="lbl">行业</span>{c.industry || <span className="muted">未填</span>}</div>
            <div><span className="lbl">负责人</span>{c.owner_id ? memberName(c.owner_id) : <span className="muted">未指定</span>}</div>
            <div><span className="lbl">渠道</span><span className="chips">{c.channels.length ? c.channels.map(x => <span key={x} className="tag ops">{CHANNEL_LABEL(x)}</span>) : <span className="muted">未填</span>}</span></div>
            <div><span className="lbl">链接</span><span className="chips">{c.links.length ? c.links.map((l, i) => <a key={i} className="chip link" href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>) : <button className="chip" onClick={() => setSetting(true)}>+ 官网 / GA / Ads / 小红书</button>}</span></div>
            {c.contacts.length > 0 && <div><span className="lbl">联系人</span><span>{c.contacts.map((p, i) => <div key={i} className="small">{p.name}{p.role ? ` · ${p.role}` : ''}{p.phone ? ` · ${p.phone}` : ''}{p.email ? ` · ${p.email}` : ''}</div>)}</span></div>}
          </div></div>
          <div className="panel"><div className="hd"><h2>campaign</h2><span className="mono muted">{camps.length}</span></div>
            <div className="bd" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {camps.map(p => <a key={p.id} href={`#p/${p.id}`} className="pcard ops thin"><h3 style={{ fontSize: 14 }}>{p.name}</h3><Stepper p={p} mini /></a>)}
              {!camps.length && <div className="muted small">还没有 campaign</div>}
            </div></div>
          <div className="panel"><div className="hd"><h2>备注</h2><span className="savehint">{hint}</span></div>
            <textarea id="cnote" className="prd-ta" style={{ minHeight: 140, fontSize: 12.5 }} value={note} onChange={e => onNote(e.target.value)} placeholder="合同要点、偏好、注意事项。不要写账号密码。" spellCheck={false} /></div>
        </aside>
        <section className="crm-main">
          <form className="composer" onSubmit={submit} autoComplete="off">
            <div className="seg"><button type="button" className={mode === 'log' ? 'on' : ''} onClick={() => setMode('log')}>记一笔</button><button type="button" className={mode === 'task' ? 'on' : ''} onClick={() => setMode('task')}>加任务</button></div>
            <input type="text" value={entry} onChange={e => setEntry(e.target.value)} placeholder={mode === 'log' ? '看完 SEO/SEM 写一句：排名、花费、异常…' : '给自己加一条今天的任务'} />
            <button className="btn pri" type="submit" disabled={!entry.trim()}>{mode === 'log' ? '记下' : '添加'}</button>
          </form>
          {open.length > 0 && <div className="section"><h2 className="clickable" onClick={() => setShowOpen(s => !s)}>{showOpen ? '▾' : '▸'} 待办<span className="n">{open.length}</span></h2>
            {showOpen && <div className="tlist">{open.map(x => <TaskRow key={x.id} t={x} onEdit={setEdit} />)}</div>}</div>}
          <div className="section"><h2>时间线<span className="n">{timeline.length}</span></h2>
            {groups.length ? <div className="timeline">{groups.map(([d, items]) => (
              <div key={d} className="tl-day"><div className="tl-date mono">{dayLabel(d)}</div>
                <div className="tl-items">{items.map(it => (
                  <div key={it.key} className={`tl-item ${it.kind}`}>
                    <i />
                    {it.kind === 'log' && <span>{it.text}</span>}
                    {it.kind === 'task' && <span className="muted">新建任务 <b className="ink clickable" onClick={() => it.task && setEdit(it.task)}>{it.text}</b>{it.task?.assignee_id ? ` · ${memberName(it.task.assignee_id)}` : ''}</span>}
                    {it.kind === 'done' && <span className="ok">完成 <b className="ink clickable" onClick={() => it.task && setEdit(it.task)}>{it.text}</b></span>}
                    {it.kind === 'campaign' && <a href={it.href} className="nolink muted">{it.text}</a>}
                  </div>))}</div>
              </div>))}</div> : <div className="empty">还没有记录。在上面记一笔今天看到的数据，时间线就从这里开始。</div>}
          </div>
        </section>
      </div>
      <ClientDialog client={setting ? (c as Client) : null} onClose={() => setSetting(false)} />
      <ProjectDialog project={newCamp ? { type: 'ops', client_id: id } : null} onClose={() => setNewCamp(false)} />
      <TaskDialog task={edit} onClose={() => setEdit(null)} />
    </>
  );
}
