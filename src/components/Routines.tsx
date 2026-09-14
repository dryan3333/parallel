import { useState } from 'react';
import { useStore } from '../state/store';

const WD = ['日', '一', '二', '三', '四', '五', '六'];
const pad = (n: number) => String(n).padStart(2, '0');

export function Routines() {
  const { routines, members, user, role, memberName, upsertRoutine, deleteRoutine, toast } = useStore();
  const [to, setTo] = useState(''); const [msg, setMsg] = useState(''); const [time, setTime] = useState('09:00');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const target = to || members.find(m => m.user_id !== user?.id)?.user_id || user?.id || '';
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!target || !msg.trim() || !days.length) return;
    const [h, m] = time.split(':').map(Number);
    const err = await upsertRoutine({ to_user: target, message: msg.trim(), hour: h, minute: m, weekdays: [...days].sort(), tz: 'Australia/Sydney', active: true });
    if (err) toast('保存失败：' + err); else { toast('定时提醒已创建'); setMsg(''); }
  };
  const canManage = (r: { created_by: string }) => r.created_by === user?.id || role === 'owner';
  return (
    <div className="panel" style={{ marginTop: 22 }}>
      <div className="hd"><h2>定时提醒</h2><span className="muted small">到点自动发到对方的收件箱，每 10 分钟检查一次，按悉尼时间</span></div>
      <div className="bd">
        <form onSubmit={submit} className="routine-form" autoComplete="off">
          <select value={target} onChange={e => setTo(e.target.value)}>
            {members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name || m.email}{m.user_id === user?.id ? '（我）' : ''}</option>)}
          </select>
          <input type="text" value={msg} onChange={e => setMsg(e.target.value)} placeholder="例如：看一下今天的 SEO 和 SEM 数据" required />
          <input type="time" value={time} onChange={e => setTime(e.target.value)} step={600} />
          <div className="chips">{WD.map((w, i) => <button type="button" key={i} className={`chip ${days.includes(i) ? 'on' : ''}`} onClick={() => setDays(d => d.includes(i) ? d.filter(x => x !== i) : [...d, i])}>{w}</button>)}</div>
          <button className="btn pri" type="submit" disabled={!members.length}>创建</button>
        </form>
        {routines.length ? <div className="tlist flat" style={{ marginTop: 12 }}>{routines.map(r => (
          <div key={r.id} className={`trow plain ${r.active ? '' : 'done'}`}>
            <span className="t">
              <span className="tag who">给 {memberName(r.to_user)}</span> {r.message}
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
