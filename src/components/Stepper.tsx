import type { Project } from '../lib/types';
import { fmtDue, nextUndoneIdx, todayStr } from '../lib/util';

export function Stepper({ p, mini, onToggle }: { p: Project; mini?: boolean; onToggle?: (i: number) => void }) {
  const cur = nextUndoneIdx(p); const t = todayStr();
  return (
    <div className={`stepper ${mini ? 'mini' : ''}`}>
      {(p.stages || []).map((s, i) => {
        const cls = s.done ? 'done' : i === cur ? 'cur' : '';
        const late = !s.done && s.due && s.due < t;
        return (
          <span key={i} className={`step ${cls} ${late ? 'late' : ''} ${onToggle ? 'click' : ''}`} title={onToggle ? '点击切换完成' : undefined}
            onClick={onToggle ? (e) => { e.preventDefault(); e.stopPropagation(); onToggle(i); } : undefined}>
            <i></i>{s.name}{s.due ? <span className="d">{fmtDue(s.due)}</span> : null}
          </span>
        );
      })}
    </div>
  );
}
