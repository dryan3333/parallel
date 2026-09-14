import { useState } from 'react';
import { useStore } from '../state/store';
import type { Task } from '../lib/types';
import { addDays, todayStr } from '../lib/util';
import { PriTag, ProjTag, WhoTag } from '../components/Tags';
import { TaskDialog } from '../components/Dialogs';

const WD = ['一', '二', '三', '四', '五', '六', '日'];
const mondayOf = (s: string) => { const d = new Date(s + 'T00:00:00'); const off = (d.getDay() + 6) % 7; return addDays(s, -off); };

export function Week() {
  const { tasks, projects, upsertTask, canEditTask, memberName, toast } = useStore();
  const [start, setStart] = useState(mondayOf(todayStr()));
  const [edit, setEdit] = useState<Partial<Task> | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const t = todayStr();
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const unscheduled = tasks.filter(x => !x.due && x.status !== 'done');
  const drop = (id: string, due: string | null) => {
    const task = tasks.find(x => x.id === id); if (!task || task.due === due) return;
    if (!canEditTask(task)) { toast('你没有这个任务的权限'); return; }
    upsertTask({ ...task, due });
  };
  const Card = ({ x }: { x: Task }) => (
    <div className={`wcard ${x.status === 'done' ? 'done' : ''}`} draggable onDragStart={e => { e.dataTransfer.setData('text/plain', x.id); e.dataTransfer.effectAllowed = 'move'; }} onClick={() => setEdit(x)}>
      <div className="t"><PriTag priority={x.priority} /> {x.title}</div>
      <div className="m"><ProjTag p={projects.find(p => p.id === x.project_id)} /><WhoTag name={memberName(x.assignee_id)} /></div>
    </div>);
  const col = (key: string | null, title: string, sub: string, list: Task[], cls = '') => (
    <div key={key ?? 'none'} className={`wcol ${cls} ${over === (key ?? 'none') ? 'over' : ''}`}
      onDragOver={e => { e.preventDefault(); setOver(key ?? 'none'); }} onDragLeave={() => setOver(null)}
      onDrop={e => { e.preventDefault(); setOver(null); drop(e.dataTransfer.getData('text/plain'), key); }}>
      <h2><span>{title}</span><span className="mono muted">{sub}</span></h2>
      {list.map(x => <Card key={x.id} x={x} />)}
      {!list.length && <div className="wempty">拖任务到这里</div>}
    </div>);
  return (
    <>
      <div className="page-h"><h1>本周</h1>
        <div className="chips"><button className="chip" onClick={() => setStart(addDays(start, -7))}>‹ 上周</button><button className="chip" onClick={() => setStart(mondayOf(t))}>本周</button><button className="chip" onClick={() => setStart(addDays(start, 7))}>下周 ›</button></div>
        <span className="sub">{start.slice(5).replace('-', '/')} 至 {days[6].slice(5).replace('-', '/')} · 拖动卡片改截止日</span>
        <span className="spacer" /><button className="btn" onClick={() => setEdit({ due: t })}>+ 任务</button></div>
      <div className="week">
        {days.map((d, i) => {
          const list = tasks.filter(x => x.due === d).sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done'));
          const [, m, dd] = d.split('-');
          return col(d, `周${WD[i]}`, `${Number(m)}/${Number(dd)}`, list, d === t ? 'today' : d < t ? 'past' : '');
        })}
        {col(null, '未排期', String(unscheduled.length), unscheduled, 'none')}
      </div>
      <TaskDialog task={edit} onClose={() => setEdit(null)} />
    </>
  );
}
