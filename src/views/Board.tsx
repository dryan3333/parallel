import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/store';
import type { Status, Task } from '../lib/types';
import { todayStr } from '../lib/util';
import { DueTag, PriTag, ProjTag, WhoTag } from '../components/Tags';
import { TaskDialog } from '../components/Dialogs';

const COLS: [Status, string][] = [['todo', '待办'], ['doing', '进行中'], ['done', '完成']];

/* 键盘抄 Linear：j/k 上下、h/l 左右换列、1/2/3 把选中卡片移到对应列、e 完成、Enter 编辑、Esc 取消选中 */
export function Board() {
  const { projects, clients, tasks, patchTask, canEditTask, memberName, toast, user } = useStore();
  const [filter, setFilter] = useState<'all' | 'mine' | 'product' | 'ops'>('all');
  const [who, setWho] = useState('');
  const [edit, setEdit] = useState<Partial<Task> | null>(null);
  const [over, setOver] = useState<Status | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const list = tasks.filter(x => (filter === 'all' || (filter === 'mine' ? x.assignee_id === user?.id : projects.find(p => p.id === x.project_id)?.type === filter)) && (!who || x.assignee_id === who));
  const cols = useMemo(() => COLS.map(([st]) => list.filter(x => x.status === st).sort((a, b) => ((a.due || '9') < (b.due || '9') ? -1 : 1))), [list]);
  const move = (t: Task, to: Status) => {
    if (t.status === to) return;
    if (!canEditTask(t)) { toast('你没有这个任务的权限'); return; }
    patchTask(t.id, { status: to, done_at: to === 'done' ? todayStr() : null });
  };
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable],dialog')) return;
      const ci = cols.findIndex(c => c.some(x => x.id === sel)); const col = ci >= 0 ? cols[ci] : cols.find(c => c.length) || [];
      const ri = col.findIndex(x => x.id === sel);
      const cur = ri >= 0 ? col[ri] : null;
      const pick = (c: Task[], i: number) => { if (c[i]) setSel(c[i].id); };
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); pick(col, Math.min(col.length - 1, ri + 1)); }
      else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); pick(col, Math.max(0, ri - 1)); }
      else if (e.key === 'h' || e.key === 'ArrowLeft') { e.preventDefault(); const nc = cols[Math.max(0, (ci < 0 ? 0 : ci) - 1)]; pick(nc, Math.min(nc.length - 1, Math.max(0, ri))); }
      else if (e.key === 'l' || e.key === 'ArrowRight') { e.preventDefault(); const nc = cols[Math.min(2, (ci < 0 ? 0 : ci) + 1)]; pick(nc, Math.min(nc.length - 1, Math.max(0, ri))); }
      else if (cur && ['1', '2', '3'].includes(e.key)) { e.preventDefault(); move(cur, COLS[Number(e.key) - 1][0]); }
      else if (cur && e.key === 'e') { e.preventDefault(); move(cur, cur.status === 'done' ? 'todo' : 'done'); }
      else if (cur && e.key === 'Enter') { e.preventDefault(); setEdit(cur); }
      else if (e.key === 'Escape') setSel(null);
      else if (e.key === 'c') { e.preventDefault(); setEdit({ due: '' }); }
    };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  }, [cols, sel]); // eslint-disable-line
  const members = Array.from(new Map(tasks.filter(x => x.assignee_id).map(x => [x.assignee_id!, memberName(x.assignee_id)])).entries());
  return (
    <>
      <div className="page-h"><h1>看板</h1>
        <div className="chips">{([['all', '全部'], ['mine', '我的'], ['product', '产品'], ['ops', '运营']] as const).map(([k, l]) => <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>)}</div>
        {members.length > 1 && <select value={who} onChange={e => setWho(e.target.value)} style={{ width: 'auto' }}><option value="">所有人</option>{members.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>}
        <span className="spacer" /><span className="muted small kbd-hint">j k h l 移动 · 1 2 3 换列 · e 完成 · Enter 编辑 · c 新建</span><button className="btn" onClick={() => setEdit({ due: '' })}>+ 任务</button></div>
      <div className="board">
        {COLS.map(([st, title], i) => {
          const items = cols[i];
          return (
            <div key={st} className={`col ${over === st ? 'over' : ''}`}
              onDragOver={e => { e.preventDefault(); setOver(st); }} onDragLeave={() => setOver(null)}
              onDrop={e => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/plain'); const t = tasks.find(x => x.id === id); if (t) move(t, st); }}>
              <h2><span>{title}</span><span className="mono">{items.length}</span></h2>
              {items.map(x => (
                <div key={x.id} className={`card ${sel === x.id ? 'sel' : ''}`} draggable onClick={() => setSel(x.id)} onDoubleClick={() => setEdit(x)}
                  onDragStart={e => { e.dataTransfer.setData('text/plain', x.id); e.dataTransfer.effectAllowed = 'move'; }}>
                  <span className="t" onClick={e => { e.stopPropagation(); setEdit(x); }}><PriTag priority={x.priority} /> {x.title}</span>
                  <div className="m"><ProjTag p={projects.find(p => p.id === x.project_id)} />{!x.project_id && x.client_id && <span className="tag ops">{clients.find(c => c.id === x.client_id)?.name}</span>}<WhoTag name={memberName(x.assignee_id)} /><DueTag due={x.due} /></div>
                  <div className="mv">
                    {st !== 'todo' && <button className="btn sm ghost" onClick={e => { e.stopPropagation(); move(x, st === 'done' ? 'doing' : 'todo'); }}>←</button>}
                    {st !== 'done' && <button className="btn sm ghost" onClick={e => { e.stopPropagation(); move(x, st === 'todo' ? 'doing' : 'done'); }}>→</button>}
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
