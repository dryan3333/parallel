import { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import { useStore } from '../state/store';
import type { Project, Task } from '../lib/types';
import { TYPES, curStage, fmtDue } from '../lib/util';
import { Stepper } from '../components/Stepper';
import { TaskRow } from '../components/TaskRow';
import { ProjectDialog, StagesDialog, TaskDialog } from '../components/Dialogs';
import { FilesPanel } from '../components/FilesPanel';

function renderMd(src: string) {
  try { return marked.parse(String(src || '').replace(/</g, '&lt;'), { breaks: true, gfm: true, async: false }) as string; } catch { return `<pre>${src}</pre>`; }
}

export function ProjectDetail({ id }: { id: string }) {
  const { projects, tasks, members, projectMembers, role, canEdit, patchProject, upsertTask, setProjectMember, memberName, toast, user, clients } = useStore();
  const p = projects.find(x => x.id === id);
  const [mode, setMode] = useState<'edit' | 'view'>('edit');
  const [edit, setEdit] = useState<Partial<Task> | null>(null);
  const [setting, setSetting] = useState(false); const [stages, setStages] = useState(false);
  const [prd, setPrd] = useState(''); const [hint, setHint] = useState('');
  const [title, setTitle] = useState(''); const [due, setDue] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const lastSaved = useRef('');
  useEffect(() => { if (p && p.prd !== lastSaved.current && document.activeElement?.id !== 'prd') { setPrd(p.prd || ''); lastSaved.current = p.prd || ''; } }, [p?.prd]); // eslint-disable-line
  if (!p) return <div className="empty">项目不存在或已删除。<a href="#projects">返回项目列表</a></div>;
  const editable = canEdit(p.id);
  const isOwner = role === 'owner';
  const list = tasks.filter(x => x.project_id === id).sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || ((a.due || '9') < (b.due || '9') ? -1 : 1));
  const s = curStage(p);
  const onPrd = (v: string) => {
    setPrd(v); setHint('输入中…'); window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => { lastSaved.current = v; const ok = await patchProject(p.id, { prd: v }); setHint(ok ? '已保存 ' + new Date().toTimeString().slice(0, 5) : '保存失败'); }, 800);
  };
  const toggleStage = (i: number) => {
    if (!editable) { toast('你没有这个项目的编辑权限'); return; }
    const st = p.stages.map(x => ({ ...x })); const nowDone = !st[i].done; st[i].done = nowDone;
    if (nowDone) for (let k = 0; k < i; k++) st[k].done = true; else for (let k = i + 1; k < st.length; k++) st[k].done = false;
    patchProject(p.id, { stages: st });
  };
  const setStageDue = (i: number, v: string) => { const st = p.stages.map(x => ({ ...x })); st[i].due = v; patchProject(p.id, { stages: st }); };
  const addTask = async (e: React.FormEvent) => {
    e.preventDefault(); if (!title.trim()) return;
    const r = await upsertTask({ title: title.trim(), project_id: id, due: due || null, status: 'todo', priority: 'normal', note: '', assignee_id: user?.id || null });
    if (r) { setTitle(''); setDue(''); toast('已添加'); }
  };
  const rename = (e: React.FocusEvent<HTMLHeadingElement>) => { const n = e.currentTarget.textContent?.trim() || ''; if (n && n !== p.name && editable) { patchProject(p.id, { name: n }); toast('已重命名'); } else e.currentTarget.textContent = p.name; };
  const others = members.filter(m => m.role !== 'owner');
  return (
    <>
      <div className="ph">
        <div className="row"><a href="#projects" className="btn sm ghost">← 项目</a><span className={`tag ${p.type}`}>{TYPES[p.type]}线</span>{p.client_id && clients.find(c => c.id === p.client_id) && <a href={`#c/${p.client_id}`} className="nolink"><span className="tag ops">{clients.find(c => c.id === p.client_id)!.name}</span></a>}
          {s ? <span className="muted small">当前阶段 <b className="ink">{s.name}</b>{s.due ? ' · ' + fmtDue(s.due) + ' 截止' : ''}</span> : <span className="ok small">全部阶段完成</span>}
          {!editable && <span className="tag who">只读</span>}
          <span className="spacer" />
          <button className="btn sm" onClick={() => setSetting(true)}>设置</button>
          {editable && <button className="btn sm" onClick={() => setStages(true)}>编辑阶段</button>}
        </div>
        <h1 contentEditable={editable} suppressContentEditableWarning spellCheck={false} onBlur={rename} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); } }}>{p.name}</h1>
        {p.goal && <div className="muted">{p.goal}</div>}
        <Stepper p={p} onToggle={editable ? toggleStage : undefined} />
      </div>
      <div className="detail">
        <div className="panel">
          <div className="hd"><h2>PRD</h2><span className="savehint">{hint}</span>
            <div className="seg"><button className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}>编辑</button><button className={mode === 'view' ? 'on' : ''} onClick={() => setMode('view')}>预览</button></div></div>
          {mode === 'edit' && editable
            ? <textarea id="prd" className="prd-ta" value={prd} onChange={e => onPrd(e.target.value)} placeholder="用 Markdown 写。# 标题、- 列表、| 表格 | 都可以。" spellCheck={false} />
            : <div className="md" dangerouslySetInnerHTML={{ __html: renderMd(prd || '_还没有内容。_') }} />}
        </div>
        <div className="side">
          <div className="panel"><div className="hd"><h2>任务</h2><span className="mono muted">{list.filter(x => x.status !== 'done').length} 待办 / {list.length} 总</span></div>
            {list.length ? <div className="tlist flat">{list.map(x => <TaskRow key={x.id} t={x} hideProj onEdit={setEdit} />)}</div> : <div className="empty flat">还没有任务</div>}
            {editable && <form className="addtask" onSubmit={addTask} autoComplete="off"><input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="新任务" required /><input type="date" value={due} onChange={e => setDue(e.target.value)} /><button className="btn sm pri" type="submit">添加</button></form>}
          </div>
          <div className="panel"><div className="hd"><h2>文件</h2></div><div className="bd"><FilesPanel scope={{ projectId: id }} /></div></div>
          <div className="panel"><div className="hd"><h2>阶段计划</h2></div><div className="bd">
            {p.stages?.length ? <div className="stage-rows">{p.stages.map((st, i) => (
              <div className="stage-row" key={i}>
                <span className={`cb ${st.done ? 'on' : ''}`} role="checkbox" aria-checked={!!st.done} tabIndex={0} onClick={() => toggleStage(i)} onKeyDown={e => { if (e.key === ' ') { e.preventDefault(); toggleStage(i); } }}></span>
                <span className={st.done ? 'muted' : ''}>{st.name}</span>
                <input type="date" value={st.due || ''} disabled={!editable} onChange={e => setStageDue(i, e.target.value)} /><span />
              </div>))}</div> : <div className="empty flat">没有阶段，点「编辑阶段」添加</div>}
          </div></div>
          {isOwner && <div className="panel"><div className="hd"><h2>协作者</h2><span className="muted small">勾选后对方可以修改这个项目和它的任务</span></div><div className="bd">
            {others.length ? others.map(m => { const on = projectMembers.some(pm => pm.project_id === p.id && pm.user_id === m.user_id);
              return <label key={m.user_id} className="check-row"><input type="checkbox" checked={on} onChange={e => setProjectMember(p.id, m.user_id, e.target.checked)} /> {memberName(m.user_id)} <span className="muted small">{m.email}</span></label>; })
              : <div className="muted small">还没有成员。去「成员」页邀请。</div>}
          </div></div>}
        </div>
      </div>
      <TaskDialog task={edit} onClose={() => setEdit(null)} />
      <ProjectDialog project={setting ? (p as Project) : null} onClose={() => setSetting(false)} />
      <StagesDialog project={stages ? p : null} onClose={() => setStages(false)} />
    </>
  );
}
