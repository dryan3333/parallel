import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { supabase } from '../lib/supabase';

export function Members() {
  const { members, invitations, role, user, invite, revokeInvite, removeMember, updateName, memberName, toast, projects, projectMembers, setProjectMember, tasks, clients, reminders, routines, files } = useStore();
  const exportAll = () => { const data = { exported_at: new Date().toISOString(), members, projects, tasks, clients, reminders, routines, files }; const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `parallel-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); toast('已导出，请存到你自己的网盘'); };
  const [email, setEmail] = useState(''); const [name, setName] = useState('');
  const meRow = members.find(m => m.user_id === user?.id);
  useEffect(() => { if (meRow) setName(meRow.display_name || meRow.email.split('@')[0]); }, [meRow?.display_name, meRow?.email]); // eslint-disable-line
  const isOwner = role === 'owner';
  const doInvite = async (e: React.FormEvent) => { e.preventDefault(); const err = await invite(email); if (err) toast('邀请失败：' + err); else { toast('已邀请'); setEmail(''); } };
  const active = projects.filter(p => !p.archived);
  return (
    <>
      <div className="page-h"><h1>成员与权限</h1><span className="sub">{isOwner ? '你是最高权限。邀请成员后，按项目勾选她能编辑的范围。' : '你的权限由工作区所有者分配。'}</span></div>
      <div className="two">
        <div>
          <div className="panel"><div className="hd"><h2>成员</h2></div>
            <div className="tlist flat">{members.map(m => (
              <div className="trow plain" key={m.user_id}>
                <span className="t">{m.display_name || m.email}{m.user_id === user?.id ? '（我）' : ''}<span className="muted small"> {m.email}</span></span>
                <span className="m"><span className={`tag ${m.role === 'owner' ? 'product' : 'who'}`}>{m.role === 'owner' ? '最高权限' : '成员'}</span>
                  {isOwner && m.role !== 'owner' && <button className="btn sm ghost danger" onClick={async () => { if (confirm('移除该成员？她的任务会保留。')) await removeMember(m.user_id); }}>移除</button>}</span>
              </div>))}</div>
          </div>
          {isOwner && <div className="panel" style={{ marginTop: 16 }}><div className="hd"><h2>邀请成员</h2></div><div className="bd">
            <form onSubmit={doInvite} className="inline-form"><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="对方的邮箱" required /><button className="btn pri" type="submit">邀请</button></form>
            <p className="muted small">对方用这个邮箱注册后自动进入工作区。已注册的会立即加入。</p>
            {invitations.length > 0 && <div className="tlist flat" style={{ marginTop: 8 }}>{invitations.map(i => <div key={i.id} className="trow plain"><span className="t">{i.email}<span className="tag due" style={{ marginLeft: 8 }}>待注册</span><span className="muted small"> 对方用这个邮箱注册后自动进入</span></span><span className="m"><button className="btn sm ghost danger" onClick={async () => { if (confirm(`撤销对 ${i.email} 的邀请？撤销后她注册会进入一个空工作区。`)) await revokeInvite(i.id); }}>撤销</button></span></div>)}</div>}
          </div></div>}
          <div className="panel" style={{ marginTop: 16 }}><div className="hd"><h2>我的资料</h2></div><div className="bd">
            <form className="inline-form" onSubmit={async e => { e.preventDefault(); await updateName(name.trim()); toast('已更新'); }}><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="显示名" /><button className="btn" type="submit">保存</button></form>
            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>{isOwner && <button className="btn sm" onClick={exportAll}>导出全部数据备份</button>}<button className="btn sm ghost" onClick={() => supabase.auth.signOut()}>退出登录</button></div>
            {isOwner && <p className="muted small" style={{ marginTop: 8 }}>免费版数据库没有自动备份。每周导出一次存到网盘，出事能恢复。</p>}
          </div></div>
        </div>
        {isOwner && <div className="panel"><div className="hd"><h2>项目权限矩阵</h2><span className="muted small">勾选 = 可修改和执行</span></div>
          <div className="bd matrix-wrap">
            {members.filter(m => m.role !== 'owner').length === 0 ? <div className="muted small">邀请成员后这里会出现权限矩阵。</div> :
              <table className="matrix"><thead><tr><th>项目</th>{members.filter(m => m.role !== 'owner').map(m => <th key={m.user_id}>{memberName(m.user_id)}</th>)}</tr></thead>
                <tbody>{active.map(p => <tr key={p.id}><td><span className={`tag ${p.type}`}>{p.name}</span></td>
                  {members.filter(m => m.role !== 'owner').map(m => { const on = projectMembers.some(pm => pm.project_id === p.id && pm.user_id === m.user_id);
                    return <td key={m.user_id} className="center"><input type="checkbox" checked={on} onChange={e => setProjectMember(p.id, m.user_id, e.target.checked)} /></td>; })}</tr>)}</tbody></table>}
          </div></div>}
      </div>
    </>
  );
}
