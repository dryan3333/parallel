import { useRef, useState } from 'react';
import { useStore } from '../state/store';
import type { FileCategory, FileRow } from '../lib/types';
import { CAT_LABEL, FILE_CATEGORIES, fmtSize, fmtTime, safeName } from '../lib/util';
import { MAX_BYTES, objectPath, prepare, removeObject, signedUrl, uploadBlob } from '../lib/upload';
import { Modal } from './Modal';

type Scope = { clientId?: string | null; projectId?: string | null; taskId?: string | null };
const icon = (f: FileRow) => f.kind === 'link' ? '🔗' : f.mime.startsWith('image/') ? '🖼' : f.mime === 'application/pdf' ? '📄' : /sheet|excel|csv/.test(f.mime) ? '📊' : /presentation|powerpoint/.test(f.mime) ? '📽' : /word|document/.test(f.mime) ? '📝' : /video/.test(f.mime) ? '🎬' : '📁';

/* 文件台抄 Google Drive 列表视图：一行一个文件，图标 + 名称 + 归属 + 大小 + 时间；拖拽即传；外链与上传件同列 */
export function FilesPanel({ scope, full }: { scope?: Scope; full?: boolean }) {
  const { files, clients, projects, tasks, addFile, patchFile, removeFile, memberName, user, role, wsId, toast } = useStore();
  const [cat, setCat] = useState('all'); const [cli, setCli] = useState(''); const [q, setQ] = useState('');
  const [busy, setBusy] = useState(''); const [drag, setDrag] = useState(false);
  const [compress, setCompress] = useState(true);
  const [link, setLink] = useState<{ name: string; url: string; category: FileCategory } | null>(null);
  const [editing, setEditing] = useState<FileRow | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inScope = (f: FileRow) => !scope || ((!scope.clientId || f.client_id === scope.clientId) && (!scope.projectId || f.project_id === scope.projectId) && (!scope.taskId || f.task_id === scope.taskId));
  const list = files.filter(f => inScope(f) && (cat === 'all' || f.category === cat) && (!cli || f.client_id === cli) && (!q || f.name.toLowerCase().includes(q.toLowerCase())));
  const used = files.filter(f => f.kind === 'upload').reduce((n, f) => n + f.size, 0); const quota = 1024 * 1024 * 1024; const pct = Math.min(100, Math.round(used / quota * 100));
  const inferCat = (name: string, mime: string): FileCategory => /合同|contract|报价|quote|invoice/i.test(name) ? 'contract' : /brief/i.test(name) ? 'brief' : /报告|report|月报|周报/i.test(name) ? 'report' : mime.startsWith('image/') || /video/.test(mime) ? 'asset' : 'other';
  const attach = () => ({ client_id: scope?.clientId || (scope?.projectId ? projects.find(p => p.id === scope.projectId)?.client_id || null : null), project_id: scope?.projectId || null, task_id: scope?.taskId || null });
  const upload = async (fl: FileList | File[]) => {
    if (!wsId) return;
    for (const file of Array.from(fl)) {
      if (file.size > MAX_BYTES) { toast(`${file.name} 超过 20MB，请改用「添加外链」`); continue; }
      setBusy(`上传 ${file.name}…`);
      try {
        const { blob, name, mime } = await prepare(file, compress);
        const id = crypto.randomUUID(); const path = objectPath(wsId, id, safeName(name));
        await uploadBlob(path, blob, mime);
        await addFile({ id, kind: 'upload', name, path, mime, size: blob.size, category: inferCat(name, mime), ...attach() });
      } catch (e) { toast('上传失败：' + ((e as Error).message || '')); }
    }
    setBusy(''); if (inputRef.current) inputRef.current.value = '';
  };
  const open = async (f: FileRow) => {
    if (f.kind === 'link') { window.open(f.url || '', '_blank'); return; }
    try { const u = await signedUrl(f.path!); window.open(u, '_blank'); } catch { toast('打开失败'); }
  };
  const share = async (f: FileRow) => {
    try { const u = f.kind === 'link' ? f.url! : await signedUrl(f.path!, 7 * 86400); await navigator.clipboard.writeText(u); toast(f.kind === 'link' ? '已复制链接' : '已复制 7 天有效的分享链接'); } catch { toast('复制失败'); }
  };
  const del = async (f: FileRow) => {
    if (!confirm(`删除「${f.name}」？`)) return;
    if (f.kind === 'upload' && f.path) await removeObject(f.path);
    await removeFile(f.id); toast('已删除');
  };
  const canDel = (f: FileRow) => f.uploaded_by === user?.id || role === 'owner';
  const where = (f: FileRow) => { const c = clients.find(x => x.id === f.client_id); const p = projects.find(x => x.id === f.project_id); const t = tasks.find(x => x.id === f.task_id); return [c && <a key="c" href={`#c/${c.id}`} className="nolink"><span className="tag ops">{c.name}</span></a>, p && <a key="p" href={`#p/${p.id}`} className="nolink"><span className={`tag ${p.type}`}>{p.name}</span></a>, t && <span key="t" className="tag who">{t.title.slice(0, 16)}</span>].filter(Boolean); };
  return (
    <div className={`files ${drag ? 'drag' : ''}`} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}>
      <div className="files-bar">
        <button className="btn pri sm" onClick={() => inputRef.current?.click()} disabled={!!busy}>{busy || '上传'}</button>
        <input ref={inputRef} type="file" multiple hidden onChange={e => e.target.files && upload(e.target.files)} />
        <button className="btn sm" onClick={() => setLink({ name: '', url: '', category: 'other' })}>添加外链</button>
        <label className="small muted check-row" style={{ padding: 0 }}><input type="checkbox" checked={compress} onChange={e => setCompress(e.target.checked)} /> 图片自动压缩</label>
        {full && <>
          <span className="spacer" />
          <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="搜文件名" style={{ maxWidth: 180 }} />
          <select value={cli} onChange={e => setCli(e.target.value)} style={{ width: 'auto' }}><option value="">所有客户</option>{clients.filter(c => !c.archived).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </>}
      </div>
      <div className="chips" style={{ marginBottom: 8 }}><button className={`chip ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>全部</button>{FILE_CATEGORIES.map(([k, l]) => <button key={k} className={`chip ${cat === k ? 'on' : ''}`} onClick={() => setCat(k)}>{l}</button>)}</div>
      {list.length ? <div className="tlist"><div className="frow head"><span /><span>名称</span><span>归属</span><span className="right">大小</span><span>上传</span><span /></div>
        {list.map(f => (
          <div key={f.id} className="frow">
            <span className="fic">{icon(f)}</span>
            <span className="fname" onClick={() => open(f)} title={f.name}>{f.name}<span className="tag" style={{ marginLeft: 6 }}>{CAT_LABEL(f.category)}</span></span>
            <span className="m">{where(f)}</span>
            <span className="mono muted right">{f.kind === 'link' ? '外链' : fmtSize(f.size)}</span>
            <span className="muted small">{memberName(f.uploaded_by)} · {fmtTime(f.created_at)}</span>
            <span className="qa always">
              <button className="btn sm ghost" onClick={() => open(f)} title="打开">打开</button>
              <button className="btn sm ghost" onClick={() => share(f)} title="复制链接">分享</button>
              {canDel(f) && <button className="btn sm ghost" onClick={() => setEditing(f)} title="改名 / 分类 / 归属">⋯</button>}
              {canDel(f) && <button className="btn sm ghost danger" onClick={() => del(f)} title="删除">×</button>}
            </span>
          </div>))}
      </div> : <div className="empty">{drag ? '松手上传' : '把文件拖到这里，或点「上传」。大于 20MB 的视频和设计源文件用「添加外链」。'}</div>}
      {full && <div className="usage"><div className="bar"><i style={{ width: pct + '%', background: pct > 80 ? 'var(--warn)' : 'var(--ops)' }} /></div><span className="mono muted small">已用 {fmtSize(used)} / 1 GB{pct > 80 ? ' · 快满了，大文件请用外链' : ''}</span></div>}
      <Modal open={!!link} onClose={() => setLink(null)} title="添加外链">
        {link && <form onSubmit={async e => { e.preventDefault(); if (!link.url.trim()) return; const r = await addFile({ kind: 'link', name: link.name.trim() || link.url.trim(), url: link.url.trim(), mime: 'text/uri-list', size: 0, category: link.category, ...attach() }); if (r) { toast('已添加'); setLink(null); } }}>
          <div className="f"><label>链接</label><input type="text" value={link.url} onChange={e => setLink({ ...link, url: e.target.value })} placeholder="Google Drive / Canva / Figma / 网盘…" required autoFocus /></div>
          <div className="f"><label>名称</label><input type="text" value={link.name} onChange={e => setLink({ ...link, name: e.target.value })} placeholder="例如：9 月小红书素材包" /></div>
          <div className="f"><label>分类</label><select value={link.category} onChange={e => setLink({ ...link, category: e.target.value as FileCategory })}>{FILE_CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="acts"><button type="button" className="btn" onClick={() => setLink(null)}>取消</button><button type="submit" className="btn pri">添加</button></div>
        </form>}
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="文件信息">
        {editing && <form onSubmit={async e => { e.preventDefault(); const ok = await patchFile(editing.id, { name: editing.name.trim() || editing.name, category: editing.category, client_id: editing.client_id, project_id: editing.project_id, note: editing.note }); if (ok) { toast('已保存'); setEditing(null); } }}>
          <div className="f"><label>名称</label><input type="text" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} required autoFocus /></div>
          <div className="f2">
            <div className="f"><label>分类</label><select value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value as FileCategory })}>{FILE_CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div className="f"><label>客户</label><select value={editing.client_id || ''} onChange={e => setEditing({ ...editing, client_id: e.target.value || null })}><option value="">无</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          </div>
          <div className="f"><label>项目</label><select value={editing.project_id || ''} onChange={e => setEditing({ ...editing, project_id: e.target.value || null })}><option value="">无</option>{projects.filter(p => !p.archived).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div className="f"><label>备注</label><input type="text" value={editing.note} onChange={e => setEditing({ ...editing, note: e.target.value })} /></div>
          <div className="acts"><button type="button" className="btn" onClick={() => setEditing(null)}>取消</button><button type="submit" className="btn pri">保存</button></div>
        </form>}
      </Modal>
    </div>
  );
}
