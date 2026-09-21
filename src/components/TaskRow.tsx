import { useStore } from '../state/store';
import type { Task } from '../lib/types';
import { addDays, todayStr } from '../lib/util';
import { DueTag, PriTag, ProjTag, WhoTag } from './Tags';

/* 行内快捷操作抄 Todoist：悬停出现「明天 / 下周 / 进行中 / 编辑」，勾选框在最左 */
export function TaskRow({ t, hideProj, onEdit }: { t: Task; hideProj?: boolean; onEdit: (t: Task) => void }) {
  const { projects, clients, patchTask, memberName, canEditTask, toast } = useStore();
  const p = hideProj ? undefined : projects.find(x => x.id === t.project_id);
  const c = hideProj ? undefined : (!t.project_id && t.client_id ? clients.find(x => x.id === t.client_id) : undefined);
  const editable = canEditTask(t);
  const guard = () => { if (!editable) { toast('你没有这个任务的权限'); return false; } return true; };
  const toggle = () => { if (!guard()) return; const done = t.status !== 'done'; patchTask(t.id, { status: done ? 'done' : 'todo', done_at: done ? todayStr() : null }); };
  const today = todayStr();
  const nextMonday = addDays(today, ((8 - new Date(today + 'T00:00:00').getDay()) % 7) || 7);
  const move = (due: string | null, label: string) => async () => { if (!guard()) return; if (await patchTask(t.id, { due })) toast(label); };
  const doing = () => { if (!guard()) return; patchTask(t.id, { status: t.status === 'doing' ? 'todo' : 'doing' }); };
  return (
    <div className={`trow ${t.status === 'done' ? 'done' : ''} ${t.status === 'doing' ? 'doing' : ''}`}>
      <span className={`cb ${t.status === 'done' ? 'on' : ''}`} role="checkbox" aria-checked={t.status === 'done'} tabIndex={0}
        onClick={toggle} onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } }}></span>
      <span className="t" onClick={() => onEdit(t)}><PriTag priority={t.priority} /> {t.title}{t.status === 'doing' && <span className="tag doing">进行中</span>}</span>
      <span className="m">
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
  );
}
