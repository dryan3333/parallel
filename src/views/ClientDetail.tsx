import { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import { useStore } from '../state/store';
import type { Client, Task } from '../lib/types';
import { CHANNEL_LABEL, STAGE_LABEL, appendLog, lastLogDate, todayStr } from '../lib/util';
import { Stepper } from '../components/Stepper';
import { TaskRow } from '../components/TaskRow';
import { ClientDialog } from '../components/ClientDialog';
import { ProjectDialog, TaskDialog } from '../components/Dialogs';

const md = (src: string) => { try { return marked.parse(String(src || '').replace(/</g, '&lt;'), { breaks: true, gfm: true, async: false }) as string; } catch { return src; } };

export function ClientDetail({ id }: { id: string }) {
  const { clients, projects, tasks, user, memberName, patchClient, upsertTask, toast } = useStore();
  const c = clients.find(x => x.id === id);
  const [tab, setTab] = useState<'overview' | 'log' | 'note'>('overview');
  const [setting, setSetting] = useState(false); const [newCamp, setNewCamp] = useState(false);
  const [edit, setEdit] = useState<Partial<Task> | null>(null);
  const [entry, setEntry] = useState(''); const [note, setNote] = useState(''); const [hint, setHint] = useState('');
  const timer = useRef<number | undefined>(undefined); const lastSaved = useRef('');
  useEffect(() => { if (c && c.note !== lastSaved.current && document.activeElement?.id !== 'cnote') { setNote(c.note || ''); lastSaved.current = c.note || ''; } }, [c?.note]); // eslint-disable-line
  if (!c) return <div className="empty">客户不存在或已删除。<a href="#clients">返回客户列表</a></div>;
  const camps = projects.filter(p => p.client_id === id && !p.archived);
  const open = tasks.filter(x => (x.client_id === id || camps.some(p => p.id === x.project_id)) && x.status !== 'done').sort((a, b) => ((a.due || '9') < (b.due || '9') ? -1 : 1));
  const last = lastLogDate(c.log); const t = todayStr();
  const addEntry = async (e: React.FormEvent) => {
    e.preventDefault(); if (!entry.trim()) return;
    const ok = await patchClient(id, { log: appendLog(c.log || '', entry.trim()) });
    if (ok) { setEntry(''); toast('已记一笔'); }
  };
  const onNote = (v: string) => {
    setNote(v); setHint('输入中…'); window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => { lastSaved.current = v; const ok = await patchClient(id, { note: v }); setHint(ok ? '已保存 ' + new Date().toTimeString().slice(0, 5) : '保存失败'); }, 800);
  };
  const quickTask = async (title: string) => { const r = await upsertTask({ title, client_id: id, due: t, status: 'todo', priority: 'normal', note: '', assignee_id: user?.id || null }); if (r) toast('已添加'); };
  return (
    <>
      <div className="ph">
        <div className="row"><a href="#clients" className="btn sm ghost">← 客户</a><span className="tag ops">{STAGE_LABEL(c.stage)}</span>{c.industry && <span className="muted small">{c.industry}</span>}
          {c.owner_id && <span className="muted small">{memberName(c.owner_id)} 负责</span>}
          <span className={`muted small ${!last || last < t ? '' : 'ok'}`}>{last === t ? '今天已巡检' : last ? `上次日志 ${last.slice(5).replace('-', '/')}` : '还没有日志'}</span>
          <span className="spacer" /><button className="btn sm" onClick={() => setSetting(true)}>设置</button><button className="btn sm" onClick={() => setNewCamp(true)}>+ campaign</button></div>
        <h1>{c.name}</h1>
        <div className="chips">
          {c.channels.map(x => <span key={x} className="tag ops">{CHANNEL_LABEL(x)}</span>)}
          {c.links.map((l, i) => <a key={i} className="chip link" href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>)}
          {!c.links.length && <button className="chip" onClick={() => setSetting(true)}>+ 添加官网 / GA / Ads / 小红书链接</button>}
        </div>
        <div className="seg" style={{ alignSelf: 'flex-start' }}>
          <button className={tab === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}>概览</button>
          <button className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>日志</button>
          <button className={tab === 'note' ? 'on' : ''} onClick={() => setTab('note')}>备注</button>
        </div>
      </div>
      {tab === 'overview' && <div className="detail">
        <div className="side">
          <div className="panel"><div className="hd"><h2>记一笔</h2><span className="muted small">看完 SEO/SEM 后一句话：排名、花费、异常</span></div>
            <form className="addtask" onSubmit={addEntry} style={{ borderTop: 0, gridTemplateColumns: '1fr auto' }}><input type="text" value={entry} onChange={e => setEntry(e.target.value)} placeholder={`例如：SEM 花费 $42，CTR 3.1%，关键词 A 掉到第 8`} required /><button className="btn sm pri" type="submit">记下</button></form>
            {c.log ? <div className="md small" style={{ padding: '0 14px 10px', maxHeight: 260, overflow: 'auto' }} dangerouslySetInnerHTML={{ __html: md(c.log.split('\n').slice(0, 12).join('\n')) }} /> : null}
          </div>
          <div className="panel"><div className="hd"><h2>待办</h2><span className="mono muted">{open.length}</span><span className="spacer" /><button className="btn sm" onClick={() => setEdit({ client_id: id, due: t })}>+ 任务</button></div>
            {open.length ? <div className="tlist flat">{open.map(x => <TaskRow key={x.id} t={x} onEdit={setEdit} />)}</div> : <div className="empty flat">没有待办。<button className="btn sm ghost" onClick={() => quickTask(`巡检 ${c.name} 的 SEO / SEM`)}>加一条「巡检 SEO/SEM」</button></div>}
          </div>
        </div>
        <div className="side">
          <div className="panel"><div className="hd"><h2>campaign</h2><span className="mono muted">{camps.length}</span></div>
            <div className="bd" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {camps.map(p => <a key={p.id} href={`#p/${p.id}`} className="pcard ops thin"><h3>{p.name}</h3>{p.goal && <div className="muted small">{p.goal}</div>}<Stepper p={p} mini /></a>)}
              {!camps.length && <div className="muted small">还没有 campaign。点右上角「+ campaign」新建一个运营线项目挂到这个客户。</div>}
            </div>
          </div>
        </div>
      </div>}
      {tab === 'log' && <div className="panel"><div className="hd"><h2>运营日志</h2><span className="muted small">每天一段，最新在上</span></div>
        <form className="addtask" onSubmit={addEntry} style={{ borderTop: 0, gridTemplateColumns: '1fr auto' }}><input type="text" value={entry} onChange={e => setEntry(e.target.value)} placeholder="记一笔" required /><button className="btn sm pri" type="submit">记下</button></form>
        {c.log ? <div className="md" dangerouslySetInnerHTML={{ __html: md(c.log) }} /> : <div className="empty flat">还没有日志</div>}</div>}
      {tab === 'note' && <div className="panel"><div className="hd"><h2>备注</h2><span className="savehint">{hint}</span><span className="muted small">合同要点、联系人偏好、注意事项。不要写账号密码。</span></div>
        <textarea id="cnote" className="prd-ta" style={{ minHeight: 320 }} value={note} onChange={e => onNote(e.target.value)} placeholder="Markdown" spellCheck={false} /></div>}
      <ClientDialog client={setting ? (c as Client) : null} onClose={() => setSetting(false)} />
      <ProjectDialog project={newCamp ? { type: 'ops', client_id: id } : null} onClose={() => setNewCamp(false)} />
      <TaskDialog task={edit} onClose={() => setEdit(null)} />
    </>
  );
}
