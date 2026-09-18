import { useState } from 'react';
import { useStore } from '../state/store';
import type { Status, Task } from '../lib/types';
import { todayStr } from '../lib/util';
import { DueTag, PriTag, ProjTag, WhoTag } from '../components/Tags';
import { TaskDialog } from '../components/Dialogs';

const COLS: [Status, string][] = [['todo', '待办'], ['doing', '进行中'], ['done', '完成']];

export function Board() {
  const { projects, tasks, patchTask, canEditTask, memberName, toast } = useStore();
  const [filter, setFilter] = useState<'all' | 'product' | 'ops'>('all');
  const [edit, setEdit] = useState<Partial<Task> | null>(null);
  const [over, setOver] = useState<Status | null>(null);
  const list = tasks.filter(x => filter === 'all' || projects.find(p => p.id === x.project_id)?.type === filter);
  const move = (t: Task, to: Status) => {
    if (t.status === to) return;
    if (!canEditTask(t)) { toast('你没有这个任务的权限'); return; }
    patchTask(t.id, { status: to, done_at: to === 'done' ? todayStr() : null });
  };
  return (
    <>
      <div className="page-h"><h1>看板</h1>
        <div className="chips">{([['all', '全部'], ['product', '产品'], ['ops', '运营']] as const).map(([k, l]) => <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>)}</div>
        <span className="spacer" /><button className="btn" onClick={() => setEdit({ due: '' })}>+ 任务</button></div>
      <div className="board">
        {COLS.map(([st, title]) => {
          const items = list.filter(x => x.status === st).sort((a, b) => ((a.due || '9') < (b.due || '9') ? -1 : 1));
          return (
            <div key={st} className={`col ${over === st ? 'over' : ''}`}
              onDragOver={e => { e.preventDefault(); setOver(st); }} onDragLeave={() => setOver(null)}
              onDrop={e => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/plain'); const t = tasks.find(x => x.id === id); if (t) move(t, st); }}>
              <h2><span>{title}</span><span className="mono">{items.length}</span></h2>
              {items.map(x => (
                <div key={x.id} className="card" draggable onDragStart={e => { e.dataTransfer.setData('text/plain', x.id); e.dataTransfer.effectAllowed = 'move'; }}>
                  <span className="t" onClick={() => setEdit(x)}><PriTag priority={x.priority} /> {x.title}</span>
                  <div className="m"><ProjTag p={projects.find(p => p.id === x.project_id)} /><WhoTag name={memberName(x.assignee_id)} /><DueTag due={x.due} /></div>
                  <div className="mv">
                    {st !== 'todo' && <button className="btn sm ghost" onClick={() => move(x, st === 'done' ? 'doing' : 'todo')}>←</button>}
                    {st !== 'done' && <button className="btn sm ghost" onClick={() => move(x, st === 'todo' ? 'doing' : 'done')}>→</button>}
                  </div>
                </div>))}
              {!items.length && <div className="empty flat">空</div>}
            </div>);
        })}
      </div>
      <TaskDialog task={edit} onClose={() => setEdit(null)} />
    </>
  );
}
