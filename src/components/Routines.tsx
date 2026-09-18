import { useState } from 'react';
import { useStore } from '../state/store';

const WD = ['日', '一', '二', '三', '四', '五', '六'];
const pad = (n: number) => String(n).padStart(2, '0');

export function Routines() {
  const { routines, members, user, role, memberName, upsertRoutine, deleteRoutine, toast, clients } = useStore();
  const [kind, setKind] = useState<'task' | 'message'>('task'); const [client, setClient] = useState('');
  const [to, setTo] = useState(''); const [msg, setMsg] = useState(''); const [time, setTime] = useState('09:00');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const target = to || members.find(m => m.user_id !== user?.id)?.user_id || user?.id || '';
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!target || !msg.trim() || !days.length) return;
    const [h, m] = time.split(':').map(Number);
    const err = await upsertRoutine({ to_user: target, message: msg.trim(), hour: h, minute: m, weekdays: [...days].sort(), tz: 'Australia/Sydney', active: true, kind, client_id: client || null });
    if (err) toast('保存失败：' + err); else { toast('定时提醒已创建'); setMsg(''); }
  };
  const canManage = (r: { created_by: string }) => r.created_by === user?.id || role === 'owner';
  return (
    <div className="panel" style={{ marginTop: 22 }}>
      <div className="hd"><h2>定时提醒 / 例行任务</h2><span className="muted small">到点自动生成，每 10 分钟检查一次，按悉尼时间。例行任务会出现在对方的「今天」里，勾掉即完成</span></div>
      <div className="bd">
        <form onSubmit={submit} className="routine-form" autoComplete="off">
          <div className="seg"><button type="button" className={kind === 'task' ? 'on' : ''} onClick={() => setKind('task')}>例行任务</button><button type="button" className={kind === 'message' ? 'on' : ''} onClick={() => setKind('message')}>消息提醒</button></div>
          <select value={target} onChange={e => setTo(e.target.value)}>
            {members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name || m.email}{m.user_id === user?.id ? '（我）' : ''}</option>)}
          </select>
          <select value={client} onChange={e => setClient(e.target.value)}><option value="">不关联客户</option>{clients.filter(c => !c.archived).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <input type="text" value={msg} onChange={e => setMsg(e.target.value)} placeholder={kind === 'task' ? '例如：巡检 SEO / SEM 数据并记一笔日志' : '例如：记得今天把周报发给客户'} required />
          <input type="time" value={time} onChange={e => setTime(e.target.value)} step={600} />
          <div className="chips">{WD.map((w, i) => <button type="button" key={i} className={`chip ${days.includes(i) ? 'on' : ''}`} onClick={() => setDays(d => d.includes(i) ? d.filter(x => x !== i) : [...d, i])}>{w}</button>)}</div>
          <button className="btn pri" type="submit" disabled={!members.length}>创建</button>
        </form>
        {routines.length ? <div className="tlist flat" style={{ marginTop: 12 }}>{routines.map(r => (
          <div key={r.id} className={`trow plain ${r.active ? '' : 'done'}`}>
            <span className="t">
              <span className="tag who">{r.kind === 'task' ? '任务' : '消息'} · 给 {memberName(r.to_user)}</span> {r.message}{r.client_id && clients.find(c => c.id === r.client_id) ? <span className="tag ops" style={{ marginLeft: 6 }}>{clients.find(c => c.id === r.client_id)!.name}</span> : null}
              <span className="muted small"> · {pad(r.hour)}:{pad(r.minute)} · 周{r.weekdays.length === 7 ? '每天' : [...r.weekdays].sort().map(d => WD[d]).join('')}{r.last_fired ? ` · 上次 ${r.last_fired.slice(5).replace('-', '/')}` : ''}</span>
            </span>
            <span className="m">
              {canManage(r) && <button className="btn sm ghost" onClick={async () => { const err = await upsertRoutine({ ...r, active: !r.active }); if (err) toast(err); }}>{r.active ? '暂停' : '启用'}</button>}
              {canManage(r) && <button className="btn sm ghost danger" onClick={() => deleteRoutine(r.id)}>删除</button>}
            </span>
          </div>))}</div> : <p className="muted small" style={{ margin: '10px 0 0' }}>还没有定时提醒。</p>}
      </div>
    </div>
  );
}
