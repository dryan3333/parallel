import { useState } from 'react';
import { useStore } from '../state/store';
import type { Client } from '../lib/types';
import { CHANNEL_LABEL, STAGES_CLIENT, STAGE_LABEL, addDays, lastLogDate, todayStr } from '../lib/util';
import { ClientDialog } from '../components/ClientDialog';

export function Clients() {
  const { clients, projects, tasks, memberName } = useStore();
  const [edit, setEdit] = useState<Partial<Client> | null>(null);
  const [ch, setCh] = useState('all'); const [q, setQ] = useState('');
  const t = todayStr(); const stale = addDays(t, -3);
  const list = clients.filter(c => !c.archived && (ch === 'all' || c.channels.includes(ch)) && (!q || c.name.toLowerCase().includes(q.toLowerCase()) || c.industry.includes(q)));
  const chans = Array.from(new Set(clients.flatMap(c => c.channels)));
  return (
    <>
      <div className="page-h"><h1>客户</h1><span className="sub">Miranda 每天从这里开始巡检：点客户进去，链接一排看完，记一笔日志</span>
        <span className="spacer" /><button className="btn pri" onClick={() => setEdit({ stage: 'active', channels: [] })}>+ 新建客户</button></div>
      <div className="page-h" style={{ marginTop: -6 }}>
        <div className="chips"><button className={`chip ${ch === 'all' ? 'on' : ''}`} onClick={() => setCh('all')}>全部渠道</button>{chans.map(k => <button key={k} className={`chip ${ch === k ? 'on' : ''}`} onClick={() => setCh(k)}>{CHANNEL_LABEL(k)}</button>)}</div>
        <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="搜客户名或行业" style={{ maxWidth: 240 }} />
      </div>
      {STAGES_CLIENT.map(([k, label]) => {
        const items = list.filter(c => c.stage === k); if (!items.length) return null;
        return (
          <div className="section" key={k}><h2>{label}<span className="n">{items.length}</span></h2>
            <div className="lane-grid">{items.map(c => {
              const camp = projects.filter(p => p.client_id === c.id && !p.archived).length;
              const open = tasks.filter(x => (x.client_id === c.id || projects.find(p => p.id === x.project_id)?.client_id === c.id) && x.status !== 'done').length;
              const last = lastLogDate(c.log);
              const staleLog = !last || last < stale;
              return (<a key={c.id} className="pcard ops client" href={`#c/${c.id}`}>
                <h3>{c.name}</h3>
                <div className="muted small">{c.industry || '行业未填'}{c.owner_id ? ` · ${memberName(c.owner_id)} 负责` : ''}</div>
                <div className="chips">{c.channels.map(x => <span key={x} className="tag ops">{CHANNEL_LABEL(x)}</span>)}</div>
                <div className="meta"><span className="mono">{camp} 个 campaign · {open} 待办</span><span className={`mono ${staleLog && k === 'active' ? 'warn' : ''}`}>{last ? `日志 ${last.slice(5).replace('-', '/')}` : '未巡检'}</span></div>
              </a>);
            })}</div></div>);
      })}
      {!list.length && <div className="empty">还没有客户。点右上角「+ 新建客户」，把在营客户先建进来，再把运营线项目挂到对应客户上。</div>}
      <ClientDialog client={edit} onClose={() => setEdit(null)} />
    </>
  );
}
