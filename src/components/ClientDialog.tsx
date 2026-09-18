import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { useStore } from '../state/store';
import type { Client, ClientLink, ClientStage } from '../lib/types';
import { CHANNELS, LINK_PRESETS, STAGES_CLIENT } from '../lib/util';

export function ClientDialog({ client, onClose }: { client: Partial<Client> | null; onClose: () => void }) {
  const { members, role, upsertClient, deleteClient, patchClient, toast } = useStore();
  const [f, setF] = useState<Partial<Client>>({});
  const [links, setLinks] = useState<ClientLink[]>([]);
  useEffect(() => { if (client) { setF({ industry: '', stage: 'active', channels: [], ...client }); setLinks((client.links || []).map(l => ({ ...l }))); } }, [client]);
  if (!client) return null;
  const isNew = !client.id;
  const set = (k: keyof Client, v: unknown) => setF(x => ({ ...x, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); const name = (f.name || '').trim(); if (!name) return;
    const obj = { ...f, name, links: links.filter(l => l.url.trim()).map(l => ({ label: l.label.trim() || '链接', url: l.url.trim() })) };
    const r = await upsertClient(obj as Partial<Client> & { name: string });
    if (r) { toast('已保存'); onClose(); if (isNew) location.hash = '#c/' + r.id; }
  };
  return (
    <Modal open={!!client} onClose={onClose} title={isNew ? '新建客户' : '客户设置'}>
      <form onSubmit={submit}>
        <div className="f"><label>客户名</label><input type="text" value={f.name || ''} onChange={e => set('name', e.target.value)} required autoFocus placeholder="例如：Made by Cow" /></div>
        <div className="f2">
          <div className="f"><label>行业</label><input type="text" value={f.industry || ''} onChange={e => set('industry', e.target.value)} placeholder="乳品 / 汽车 / 美容…" /></div>
          <div className="f"><label>阶段</label><select value={f.stage || 'active'} onChange={e => set('stage', e.target.value as ClientStage)}>{STAGES_CLIENT.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        </div>
        <div className="f"><label>渠道</label><div className="chips">{CHANNELS.map(([k, l]) => <button type="button" key={k} className={`chip ${(f.channels || []).includes(k) ? 'on' : ''}`} onClick={() => set('channels', (f.channels || []).includes(k) ? (f.channels || []).filter(x => x !== k) : [...(f.channels || []), k])}>{l}</button>)}</div></div>
        <div className="f"><label>内部负责人</label><select value={f.owner_id || ''} onChange={e => set('owner_id', e.target.value || null)}><option value="">未指定</option>{members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name || m.email}</option>)}</select></div>
        <div className="f"><label>快捷链接（客户页顶部一排，巡检时逐个点开）</label>
          <div className="stage-rows">{links.map((l, i) => (
            <div className="stage-row" key={i} style={{ gridTemplateColumns: '130px 1fr 28px' }}>
              <input type="text" list="linkpresets" value={l.label} onChange={e => setLinks(ls => ls.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder="名称" />
              <input type="text" value={l.url} onChange={e => setLinks(ls => ls.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} placeholder="https://…" />
              <button type="button" className="btn sm ghost" onClick={() => setLinks(ls => ls.filter((_, j) => j !== i))}>×</button>
            </div>))}</div>
          <datalist id="linkpresets">{LINK_PRESETS.map(p => <option key={p} value={p} />)}</datalist>
          <div style={{ marginTop: 6 }}><button type="button" className="btn sm" onClick={() => setLinks(ls => [...ls, { label: LINK_PRESETS[ls.length] || '', url: '' }])}>+ 加一个链接</button></div>
        </div>
        <div className="acts">
          {!isNew && <button type="button" className="btn ghost left" onClick={async () => { await patchClient(client.id!, { archived: !client.archived }); toast(client.archived ? '已恢复' : '已归档'); onClose(); location.hash = '#clients'; }}>{client.archived ? '恢复' : '归档'}</button>}
          {!isNew && role === 'owner' && <button type="button" className="btn ghost danger" onClick={async () => { if (!confirm('删除客户？挂在它下面的 campaign 和任务会保留但失去客户归属。')) return; await deleteClient(client.id!); toast('已删除'); onClose(); location.hash = '#clients'; }}>删除</button>}
          <button type="button" className="btn" onClick={onClose}>取消</button><button type="submit" className="btn pri">保存</button>
        </div>
      </form>
    </Modal>
  );
}
