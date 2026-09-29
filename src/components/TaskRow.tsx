import { useState } from 'react';
import { useStore } from '../state/store';
import type { Task } from '../lib/types';
import { addDays, appendLog, daysSince, localDate, logHint, todayStr } from '../lib/util';
import { DueTag, PriTag, ProjTag, WhoTag } from './Tags';

/* 行内快捷操作抄 Todoist：悬停出现「明天 / 下周 / 进行中 / 编辑」，勾选框在最左。
   例行任务多一行：客户链接 + 一句话日志，写完回车就算做完，不用跳到客户页 */
export function TaskRow({ t, hideProj, onEdit }: { t: Task; hideProj?: boolean; onEdit: (t: Task) => void }) {
  const { projects, clients, user, patchTask, patchClient, memberName, canEditTask, toast } = useStore();
  const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const p = hideProj ? undefined : projects.find(x => x.id === t.project_id);
  const c = hideProj ? undefined : (!t.project_id && t.client_id ? clients.find(x => x.id === t.client_id) : undefined);
  const editable = canEditTask(t);
  const guard = () => { if (!editable) { toast('你没有这个任务的权限'); return false; } return true; };
  const toggle = () => { if (!guard()) return; const done = t.status !== 'done'; patchTask(t.id, { status: done ? 'done' : 'todo', done_at: done ? todayStr() : null }); };
  const today = todayStr();
  const nextMonday = addDays(today, ((8 - new Date(today + 'T00:00:00').getDay()) % 7) || 7);
  const move = (due: string | null, label: string) => async () => { if (!guard()) return; if (await patchTask(t.id, { due })) toast(label); };
  const doing = () => { if (!guard()) return; patchTask(t.id, { status: t.status === 'doing' ? 'todo' : 'doing' }); };

  const rc = t.routine_id && t.client_id ? clients.find(x => x.id === t.client_id) : undefined;
  const showSub = !!rc && t.status !== 'done' && editable;
  const hung = t.routine_id && t.status !== 'done' && t.created_at ? daysSince(localDate(t.created_at), today) : 0;
  const logAndDone = async () => {
    const v = note.trim(); if (!v || !rc || busy) return;
    setBusy(true);
    try {
      const ok = await patchClient(rc.id, { log: appendLog(rc.log || '', v, memberName(user?.id)) });
      if (!ok) return;
      const done = await patchTask(t.id, { status: 'done', done_at: todayStr() }, { doneNote: v });
      if (!done) { toast('日志已记下，任务没勾上，再点一次勾选框'); return; }
      setNote('');
      const creator = t.created_by && t.created_by !== user?.id ? memberName(t.created_by) : '';
      toast(creator ? `已记下，并告诉了 ${creator}` : '已记下');
    } finally { setBusy(false); }
  };
  return (
    <div className="trow-wrap">
      <div className={`trow ${t.status === 'done' ? 'done' : ''} ${t.status === 'doing' ? 'doing' : ''}`}>
        <span className={`cb ${t.status === 'done' ? 'on' : ''}`} role="checkbox" aria-checked={t.status === 'done'} tabIndex={0}
          onClick={toggle} onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } }}></span>
        <span className="t" onClick={() => onEdit(t)}><PriTag priority={t.priority} /> {t.title}{t.status === 'doing' && <span className="tag doing">进行中</span>}</span>
        <span className="m">
          {hung >= 2 && <span className="tag warn">挂了 {hung} 天</span>}
          {p ? <a href={`#p/${p.id}`} className="nolink"><ProjTag p={p} /></a> : c ? <a href={`#c/${c.id}`} className="nolink"><span className="tag ops">{c.name}</span></a> : null}
          <WhoTag name={memberName(t.assignee_id)} />
          <DueTag due={t.due} />
        </span>
        {t.status !== 'done' && <span className="qa">
          {t.due !== today && <button className="btn sm ghost" onClick={move(today, '改到今天')} title="改到今天">今天</button>}
          <button className="btn sm ghost" onClick={move(addDays(today, 1), '改到明天')} title="改到明天">明天</button>
          <button className="btn sm ghost" onClick={move(nextMonday, '改到下周一')} title="改到下周一">下周</button>
          <button className="btn sm ghost" onClick={doing} title={t.status === 'doing' ? '改回待办' : '标为进行中'}>{t.status === 'doing' ? '待办' : '开始'}</button>
          <button className="btn sm ghost" onClick={() => onEdit(t)} title="编辑">⋯</button>
        </span>}
      </div>
      {showSub && rc && <div className="trow-sub">
        {(rc.links || []).length
          ? (rc.links || []).slice(0, 6).map((l, i) => <a key={i} className="chip link" href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>)
          : <><span className="muted small">这个客户还没有快捷链接</span><a className="btn sm" href={`#c/${rc.id}`}>去补链接</a></>}
        <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder={'看完写一句：' + logHint(rc.channels)}
          onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); logAndDone(); } }} />
        <button className="btn sm" type="button" onClick={logAndDone} disabled={!note.trim() || busy}>记下并完成</button>
      </div>}
    </div>
  );
}
