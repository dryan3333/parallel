import type { Project, Task } from '../lib/types';
import { todayStr } from '../lib/util';

/* 每个项目一株植物：茎高 = 已完成阶段比例；每完成一段长一片叶；全部完成开大花；当前阶段逾期则枯黄。
   当天完成的任务在地面开成小花。 */
export function Garden({ projects, tasks }: { projects: Project[]; tasks: Task[] }) {
  const t = todayStr();
  const doneToday = tasks.filter(x => x.status === 'done' && x.done_at === t).length;
  const n = projects.length; if (!n) return null;
  const W = Math.max(520, n * 130), H = 190, ground = 150;
  const slot = W / n;
  return (
    <div className="garden">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="项目花园">
        <defs>
          <linearGradient id="g-ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--ops)" stopOpacity=".18" /><stop offset="1" stopColor="var(--ops)" stopOpacity="0" /></linearGradient>
        </defs>
        <rect x="0" y={ground} width={W} height={H - ground} fill="url(#g-ground)" />
        <line x1="0" y1={ground} x2={W} y2={ground} stroke="var(--line-strong)" strokeWidth="1" />
        {projects.map((p, i) => {
          const st = p.stages || []; const done = st.filter(s => !s.done).length === 0 && st.length > 0;
          const doneN = st.filter(s => s.done).length; const ratio = st.length ? doneN / st.length : 0;
          const cur = st.find(s => !s.done); const late = !!(cur && cur.due && cur.due < t);
          const cx = slot * i + slot / 2; const h = 30 + ratio * 85; const top = ground - h;
          const color = p.type === 'product' ? 'var(--product)' : 'var(--ops)';
          const leafColor = late ? 'var(--warn)' : color;
          const open = tasks.filter(x => x.project_id === p.id && x.status !== 'done').length;
          return (
            <a key={p.id} href={`#p/${p.id}`} className="plant">
              <title>{p.name}：{doneN}/{st.length} 阶段{late ? '，当前阶段已逾期' : ''}，{open} 个待办</title>
              <path d={`M${cx} ${ground} Q${cx + 4} ${ground - h / 2} ${cx} ${top}`} stroke={leafColor} strokeWidth="3" fill="none" strokeLinecap="round" />
              {st.map((s, k) => {
                const y = ground - 14 - (h - 24) * (k / Math.max(1, st.length - 1)) * 0.9; const dir = k % 2 ? 1 : -1;
                return s.done
                  ? <ellipse key={k} cx={cx + dir * 11} cy={y} rx="12" ry="6" fill={leafColor} opacity=".9" transform={`rotate(${dir * -28} ${cx + dir * 11} ${y})`} />
                  : <circle key={k} cx={cx + dir * 7} cy={y} r="2" fill="var(--line-strong)" />;
              })}
              {done
                ? <g><circle cx={cx} cy={top - 6} r="11" fill="var(--warn-soft)" stroke="var(--warn)" strokeWidth="2" /><circle cx={cx} cy={top - 6} r="4" fill="var(--warn)" /></g>
                : <circle cx={cx} cy={top} r={late ? 4 : 5} fill={late ? 'var(--warn-soft)' : 'var(--surface)'} stroke={leafColor} strokeWidth="2.5" />}
              <text x={cx} y={ground + 18} textAnchor="middle" fontSize="11" fill="var(--ink)">{p.name.length > 18 ? p.name.slice(0, 17) + '…' : p.name}</text>
              <text x={cx} y={ground + 32} textAnchor="middle" fontSize="10" fill="var(--muted)">{st.length ? `${doneN}/${st.length} 阶段` : '未排阶段'}{open ? ` · ${open} 待办` : ''}</text>
            </a>
          );
        })}
        {Array.from({ length: Math.min(doneToday, 14) }).map((_, i) => {
          const x = 18 + (i * 37) % (W - 36); const y = ground - 3;
          return <g key={i}><line x1={x} y1={y} x2={x} y2={y - 9} stroke="var(--ok)" strokeWidth="1.5" /><circle cx={x} cy={y - 11} r="3.5" fill="var(--ok-soft)" stroke="var(--ok)" strokeWidth="1.5" /></g>;
        })}
      </svg>
      <div className="garden-cap muted small">阶段每完成一段长一片叶，全部完成开花；当前阶段逾期会变黄。{doneToday ? `今天完成 ${doneToday} 项，地上开了 ${Math.min(doneToday, 14)} 朵小花。` : '今天完成的任务会在地上开成小花。'}</div>
    </div>
  );
}
