import { useStore } from '../state/store';
import type { Task } from '../lib/types';
import { todayStr } from '../lib/util';
import { DueTag, PriTag, ProjTag, WhoTag } from './Tags';

export function TaskRow({ t, hideProj, onEdit }: { t: Task; hideProj?: boolean; onEdit: (t: Task) => void }) {
  const { projects, upsertTask, memberName, canEditTask, toast } = useStore();
  const p = hideProj ? undefined : projects.find(x => x.id === t.project_id);
  const editable = canEditTask(t);
  const toggle = () => {
    if (!editable) { toast('你没有这个任务的权限'); return; }
    const done = t.status !== 'done';
    upsertTask({ ...t, status: done ? 'done' : 'todo', done_at: done ? todayStr() : null });
  };
  return (
    <div className={`trow ${t.status === 'done' ? 'done' : ''}`}>
      <span className={`cb ${t.status === 'done' ? 'on' : ''}`} role="checkbox" aria-checked={t.status === 'done'} tabIndex={0}
        onClick={toggle} onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } }}></span>
      <span className="t" onClick={() => onEdit(t)}><PriTag priority={t.priority} /> {t.title}</span>
      <span className="m">
        {p ? <a href={`#p/${p.id}`} className="nolink"><ProjTag p={p} /></a> : null}
        <WhoTag name={memberName(t.assignee_id)} />
        <DueTag due={t.due} />
      </span>
    </div>
  );
}
