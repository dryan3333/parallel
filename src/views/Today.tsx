import { useState } from 'react';
import { useStore } from '../state/store';
import type { Task } from '../lib/types';
import { TYPES, addDays, curStage, dueClass, fmtDue, todayStr } from '../lib/util';
import { TaskRow } from '../components/TaskRow';
import { TaskDialog } from '../components/Dialogs';

export function Today() {
  const { projects, tasks, user, upsertTask, toast, memberName } = useStore();
  const [edit, setEdit] = useState<Partial<Task> | null>(null);
  const [mine, setMine] = useState(false);
  const [title, setTitle] = useState(''); const [pid, setPid] = useState(''); const [due, setDue] = useState(todayStr());
  const t = todayStr(), week = addDays(t, 7);
  const ps = projects.filter(p => !p.archived);
  const all = mine ? tasks.filter(x => x.assignee_id === user?.id || (!x.assignee_id && x.created_by === user?.id)) : tasks;
  const open = all.filter(x => x.status !== 'done');
  const over = open.filter(x => x.due && x.due < t).sort((a, b) => a.due!.localeCompare(b.due!));
  const today = open.filter(x => x.due === t);
  const doing = open.filter(x => x.status === 'doing' && !(x.due && x.due <= t));
  const soon = open.filter(x => x.due && x.due > t && x.due <= week && x.status !== 'doing').sort((a, b) => a.due!.localeCompare(b.due!));
  const doneToday = all.filter(x => x.status === 'done' && x.done_at === t);
  const d = new Date(); const wd = '日一二三四五六'[d.getDay()];
  const quick = async (e: React.FormEvent) => {
    e.preventDefault(); if (!title.trim()) return;
    const r = await upsertTask({ title: title.trim(), project_id: pid || null, due: due || null, status: 'todo', priority: 'normal', note: '', assignee_id: user?.id || null });
    if (r) { setTitle(''); toast('已添加'); }
  };
  const Sec = ({ name, list, cls }: { name: string; list: Task[]; cls?: string }) => list.length ? (
    <div className="section"><h2 className={cls}>{name}<span className="n">{list.length}</span></h2>
      <div className="tlist">{list.map(x => <TaskRow key={x.id} t={x} onEdit={setEdit} />)}</div></div>) : null;
  return (
    <>
      <div className="page-h"><h1>{d.getMonth() + 1} 月 {d.getDate()} 日，周{wd}</h1>
        <span className="sub">{over.length ? <><span className="danger">{over.length} 项逾期</span>，</> : null}今天 {today.length} 项，进行中 {doing.length} 项</span>
        <span className="spacer" />
        <div className="chips"><button className={`chip ${!mine ? 'on' : ''}`} onClick={() => setMine(false)}>全部</button><button className={`chip ${mine ? 'on' : ''}`} onClick={() => setMine(true)}>只看我的</button></div>
      </div>
      <div className="lane-grid">
        {ps.map(p => { const s = curStage(p); const cnt = tasks.filter(x => x.project_id === p.id && x.status !== 'done').length; const late = s && s.due && s.due < t;
          return (<a key={p.id} className={`pcard ${p.type}`} href={`#p/${p.id}`}><h3>{p.name}</h3>
            <div className="stg">{s ? <>当前阶段 <b>{s.name}</b>{s.due ? <span className={`tag due ${late ? 'over' : dueClass(s.due)}`}>{fmtDue(s.due)}</span> : null}</> : <b className="ok">全部阶段完成</b>}</div>
            <div className="meta"><span>{TYPES[p.type]}</span><span className="mono">{cnt} 个待办</span></div></a>); })}
        {!ps.length && <div className="empty span">还没有项目。去「项目」页新建一个产品线或运营线。</div>}
      </div>
      <form className="quick" onSubmit={quick} autoComplete="off">
        <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder={`快速添加任务给${memberName(user?.id) || '我'}，回车保存`} required />
        <select value={pid} onChange={e => setPid(e.target.value)}><option value="">不关联项目</option>{ps.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <input type="date" value={due} onChange={e => setDue(e.target.value)} />
        <button className="btn pri" type="submit">添加</button>
      </form>
      <Sec name="已逾期" list={over} cls="over" /><Sec name="今天" list={today} /><Sec name="进行中" list={doing} /><Sec name="未来 7 天" list={soon} /><Sec name="今天完成" list={doneToday} />
      {!over.length && !today.length && !doing.length && !soon.length && <div className="empty">今天没有安排。加一条任务，或者去项目里排阶段计划。</div>}
      <TaskDialog task={edit} onClose={() => setEdit(null)} />
    </>
  );
}
