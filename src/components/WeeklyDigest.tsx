import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { addDays, lastLogDate, todayStr } from '../lib/util';

const mondayOf = (s: string) => { const d = new Date(s + 'T00:00:00'); const off = (d.getDay() + 6) % 7; return addDays(s, -off); };
const countLogs = (log: string, from: string, to: string) => { let n = 0, cur = ''; for (const line of (log || '').split('\n')) { const m = line.match(/^## (\d{4}-\d{2}-\d{2})/); if (m) { cur = m[1]; continue; } if (/^- /.test(line) && cur >= from && cur <= to) n++; } return n; };

/* 管理者回路：周一打开就有的一张摘要。上周谁记了几条、哪些客户没人看、这周到期什么、逾期什么；一键复制成周报。 */
export function WeeklyDigest({ start }: { start: string }) {
  const { tasks, clients, projects, members, memberName, toast } = useStore();
  const [open, setOpen] = useState(true);
  const t = todayStr();
  const end = addDays(start, 6); const prevStart = addDays(start, -7); const prevEnd = addDays(start, -1);
  const d = useMemo(() => {
    const active = clients.filter(c => !c.archived && c.stage === 'active');
    const doneLast = tasks.filter(x => x.status === 'done' && x.done_at && x.done_at >= prevStart && x.done_at <= prevEnd);
    const dueThis = tasks.filter(x => x.status !== 'done' && x.due && x.due >= start && x.due <= end);
    const overdue = tasks.filter(x => x.status !== 'done' && x.due && x.due < t);
    const byMember = members.map(m => ({ name: memberName(m.user_id), done: doneLast.filter(x => x.assignee_id === m.user_id).length, due: dueThis.filter(x => x.assignee_id === m.user_id).length, over: overdue.filter(x => x.assignee_id === m.user_id).length }));
    const perClient = active.map(c => ({ c, logs: countLogs(c.log, prevStart, prevEnd), last: lastLogDate(c.log), camps: projects.filter(p => p.client_id === c.id && !p.archived).length }));
    const stale = perClient.filter(x => !x.last || x.last < addDays(t, -3));
    return { active, doneLast, dueThis, overdue, byMember, perClient, stale };
  }, [tasks, clients, projects, members, start]); // eslint-disable-line
  const fmt = (s: string) => s.slice(5).replace('-', '/');
  const text = () => {
    const L: string[] = [];
    L.push(`# 周报 ${fmt(prevStart)}–${fmt(prevEnd)}`, '');
    L.push(`## 上周完成 ${d.doneLast.length} 项`);
    d.byMember.forEach(m => L.push(`- ${m.name}：完成 ${m.done}，本周到期 ${m.due}${m.over ? `，逾期 ${m.over}` : ''}`));
    L.push('', '## 客户巡检');
    d.perClient.forEach(x => L.push(`- ${x.c.name}：上周日志 ${x.logs} 条${x.last ? `，最近 ${fmt(x.last)}` : '，还没有日志'}${x.camps ? `，${x.camps} 个 campaign` : ''}`));
    if (d.overdue.length) { L.push('', `## 逾期 ${d.overdue.length} 项`); d.overdue.forEach(x => L.push(`- ${x.title}（${fmt(x.due!)}，${memberName(x.assignee_id) || '未指派'}）`)); }
    L.push('', `## 本周到期 ${d.dueThis.length} 项`); d.dueThis.sort((a, b) => a.due!.localeCompare(b.due!)).forEach(x => L.push(`- ${fmt(x.due!)} ${x.title}（${memberName(x.assignee_id) || '未指派'}）`));
    return L.join('\n');
  };
  const copy = async () => { try { await navigator.clipboard.writeText(text()); toast('周报已复制，粘到哪里都行'); } catch { toast('复制失败'); } };
  return (
    <div className="digest">
      <div className="hd"><h2 className="clickable" onClick={() => setOpen(o => !o)}>{open ? '▾' : '▸'} 周摘要</h2><span className="muted small">上周 {fmt(prevStart)}–{fmt(prevEnd)} 的结果，这周的安排</span><span className="spacer" /><button className="btn sm" onClick={copy}>复制成周报</button></div>
      {open && <div className="digest-grid">
        <div className="kpi"><b>{d.doneLast.length}</b><span>上周完成</span></div>
        <div className="kpi"><b>{d.dueThis.length}</b><span>本周到期</span></div>
        <div className={`kpi ${d.overdue.length ? 'bad' : ''}`}><b>{d.overdue.length}</b><span>逾期未清</span></div>
        <div className={`kpi ${d.stale.length ? 'warn' : ''}`}><b>{d.stale.length}</b><span>三天没巡检的客户</span></div>
        <div className="digest-list">
          <h3>按人</h3>
          {d.byMember.map(m => <div key={m.name} className="row"><span>{m.name}</span><span className="mono muted">完成 {m.done} · 到期 {m.due}{m.over ? <span className="danger"> · 逾期 {m.over}</span> : null}</span></div>)}
        </div>
        <div className="digest-list">
          <h3>按客户</h3>
          {d.perClient.length ? d.perClient.map(x => <div key={x.c.id} className="row"><a href={`#c/${x.c.id}`} className="nolink">{x.c.name}</a><span className="mono muted">上周 {x.logs} 条{x.last ? ` · 最近 ${fmt(x.last)}` : <span className="warn"> · 未巡检</span>}</span></div>) : <div className="muted small">还没有在营客户</div>}
        </div>
      </div>}
    </div>
  );
}
