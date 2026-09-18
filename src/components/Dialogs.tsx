import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { useStore } from '../state/store';
import type { Project, ProjectType, Stage, Task } from '../lib/types';
import { PRD_TPL, TYPES, defaultStages, todayStr } from '../lib/util';

/* ---------- 任务 ---------- */
export function TaskDialog({ task, onClose }: { task: Partial<Task> | null; onClose: () => void }) {
  const { projects, members, user, upsertTask, deleteTask, canEdit, canEditTask, toast } = useStore();
  const [f, setF] = useState<Partial<Task>>({});
  useEffect(() => { if (task) setF({ status: 'todo', priority: 'normal', note: '', ...task }); }, [task]);
  if (!task) return null;
  const isNew = !task.id;
  const editable = isNew ? canEdit(f.project_id || null) : canEditTask(task as Task);
  const set = (k: keyof Task, v: unknown) => setF(x => ({ ...x, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editable) { toast('你没有这个任务的权限'); return; }
    const obj: Partial<Task> & { title: string } = { ...f, title: (f.title || '').trim() };
    if (!obj.title) return;
    if (obj.status === 'done' && task.status !== 'done') obj.done_at = todayStr();
    if (obj.status !== 'done') obj.done_at = null;
    const r = await upsertTask(obj); if (r) { toast('已保存'); onClose(); }
  };
  const editableProjects = projects.filter(p => !p.archived && canEdit(p.id));
  return (
    <Modal open={!!task} onClose={onClose} title={isNew ? '新任务' : '编辑任务'}>
      <form onSubmit={submit}>
        <div className="f"><label>标题</label><input type="text" value={f.title || ''} onChange={e => set('title', e.target.value)} required autoFocus /></div>
        <div className="f2">
          <div className="f"><label>项目</label>
            <select value={f.project_id || ''} onChange={e => set('project_id', e.target.value || null)}>
              <option value="">不关联项目</option>
              {editableProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></div>
          <div className="f"><label>截止</label><input type="date" value={f.due || ''} onChange={e => set('due', e.target.value || null)} /></div>
        </div>
        <div className="f2">
          <div className="f"><label>负责人</label>
            <select value={f.assignee_id || ''} onChange={e => set('assignee_id', e.target.value || null)}>
              <option value="">未指派</option>
              {members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name || m.email}{m.user_id === user?.id ? '（我）' : ''}</option>)}
            </select></div>
          <div className="f"><label>状态</label>
            <select value={f.status || 'todo'} onChange={e => set('status', e.target.value)}>
              <option value="todo">待办</option><option value="doing">进行中</option><option value="done">完成</option>
            </select></div>
        </div>
        <div className="f2">
          <div className="f"><label>优先级</label>
            <select value={f.priority || 'normal'} onChange={e => set('priority', e.target.value)}>
              <option value="normal">普通</option><option value="high">P0 紧急</option>
            </select></div>
        </div>
        <div className="f"><label>备注</label><textarea rows={3} value={f.note || ''} onChange={e => set('note', e.target.value)} /></div>
        {!editable && <p className="hint warn">你没有这个任务所属项目的编辑权限，只能查看。</p>}
        <div className="acts">
          {!isNew && editable && <button type="button" className="btn ghost danger left" onClick={async () => { await deleteTask(task.id!); toast('已删除'); onClose(); }}>删除</button>}
          <button type="button" className="btn" onClick={onClose}>取消</button>
          {editable && <button type="submit" className="btn pri">保存</button>}
        </div>
      </form>
    </Modal>
  );
}

/* ---------- 项目 ---------- */
export function ProjectDialog({ project, onClose }: { project: Partial<Project> | null; onClose: () => void }) {
  const { role, upsertProject, deleteProject, toast, canEdit, clients } = useStore();
  const [f, setF] = useState<Partial<Project>>({});
  useEffect(() => { if (project) setF({ goal: '', type: 'product', ...project }); }, [project]);
  if (!project) return null;
  const isNew = !project.id;
  const isOwner = role === 'owner';
  const editable = isNew ? (isOwner || (f.type || 'product') === 'ops') : canEdit(project.id || null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = (f.name || '').trim(); if (!name) return;
    const type = (f.type || 'product') as ProjectType;
    if (isNew && !isOwner && type !== 'ops') { toast('产品线项目只有最高权限可以新建'); return; }
    const obj: Partial<Project> & { name: string; type: ProjectType } = { ...f, name, type, goal: (f.goal || '').trim() };
    if (isNew) { obj.stages = defaultStages(type); obj.prd = PRD_TPL[type].replace('{name}', name); obj.archived = false; }
    const r = await upsertProject(obj);
    if (r) { toast('已保存'); onClose(); if (isNew) location.hash = '#p/' + r.id; }
  };
  return (
    <Modal open={!!project} onClose={onClose} title={isNew ? '新建项目' : '项目设置'}>
      <form onSubmit={submit}>
        <div className="f"><label>名称</label><input type="text" value={f.name || ''} onChange={e => setF(x => ({ ...x, name: e.target.value }))} required autoFocus placeholder="例如：Jarvis Solar CRM / 品牌出海澳洲落地" /></div>
        <div className="f"><label>类型</label>
          <select value={f.type || 'product'} onChange={e => setF(x => ({ ...x, type: e.target.value as ProjectType }))} disabled={!isNew}>
            {(Object.keys(TYPES) as ProjectType[]).map(k => <option key={k} value={k}>{TYPES[k]}线</option>)}
          </select></div>
        {(f.type || 'product') === 'ops' && <div className="f"><label>所属客户</label>
          <select value={f.client_id || ''} onChange={e => setF(x => ({ ...x, client_id: e.target.value || null }))}>
            <option value="">不挂客户（内部运营线）</option>
            {clients.filter(c => !c.archived).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>}
        <div className="f"><label>一句话目标</label><input type="text" value={f.goal || ''} onChange={e => setF(x => ({ ...x, goal: e.target.value }))} placeholder="这个项目做成了是什么样" /></div>
        {isNew && <p className="hint">会按类型自动生成阶段和 PRD 模板，之后都能改。</p>}
        {isNew && !isOwner && (f.type || 'product') !== 'ops' && <p className="hint warn">产品线项目只有最高权限可以新建，你可以新建运营线 campaign。</p>}
        {!isNew && !isOwner && <p className="hint">只有最高权限可以归档或删除项目。</p>}
        <div className="acts">
          {!isNew && isOwner && <>
            <button type="button" className="btn ghost left" onClick={async () => { await upsertProject({ ...(project as Project), archived: !project.archived }); toast(project.archived ? '已恢复' : '已归档'); onClose(); location.hash = '#projects'; }}>{project.archived ? '恢复' : '归档'}</button>
            <button type="button" className="btn ghost danger" onClick={async () => { if (!confirm('删除项目会一并删除它的任务，确定？')) return; await deleteProject(project.id!); toast('已删除'); onClose(); location.hash = '#projects'; }}>删除</button>
          </>}
          <button type="button" className="btn" onClick={onClose}>取消</button>
          {editable && <button type="submit" className="btn pri">保存</button>}
        </div>
      </form>
    </Modal>
  );
}

/* ---------- 阶段 ---------- */
export function StagesDialog({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const { upsertProject, toast } = useStore();
  const [rows, setRows] = useState<Stage[]>([]);
  useEffect(() => { if (project) setRows((project.stages || []).map(s => ({ ...s }))); }, [project]);
  if (!project) return null;
  const upd = (i: number, k: keyof Stage, v: string | boolean) => setRows(rs => rs.map((r, j) => j === i ? { ...r, [k]: v } : r));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const stages = rows.filter(r => r.name.trim()).map(r => ({ name: r.name.trim(), due: r.due || '', done: !!r.done }));
    const r = await upsertProject({ ...project, stages }); if (r) { toast('阶段已更新'); onClose(); }
  };
  return (
    <Modal open={!!project} onClose={onClose} title="编辑阶段">
      <form onSubmit={submit}>
        <div className="stage-rows">
          {rows.map((s, i) => (
            <div className="stage-row" key={i}>
              <span className="mono muted center">{i + 1}</span>
              <input type="text" value={s.name} onChange={e => upd(i, 'name', e.target.value)} required />
              <input type="date" value={s.due || ''} onChange={e => upd(i, 'due', e.target.value)} />
              <button type="button" className="btn sm ghost" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10 }}><button type="button" className="btn sm" onClick={() => setRows(rs => [...rs, { name: '', due: '', done: false }])}>+ 加一个阶段</button></div>
        <div className="acts"><button type="button" className="btn" onClick={onClose}>取消</button><button type="submit" className="btn pri">保存</button></div>
      </form>
    </Modal>
  );
}

/* ---------- 提醒 ---------- */
export function ReminderDialog({ open, onClose, preset }: { open: boolean; onClose: () => void; preset?: { to?: string; message?: string; taskId?: string | null } }) {
  const { members, user, sendReminder, toast } = useStore();
  const others = members.filter(m => m.user_id !== user?.id);
  const [to, setTo] = useState(''); const [msg, setMsg] = useState(''); const [at, setAt] = useState('');
  useEffect(() => { if (open) { setTo(preset?.to || others[0]?.user_id || ''); setMsg(preset?.message || ''); setAt(''); } }, [open]); // eslint-disable-line
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!to || !msg.trim()) return;
    const err = await sendReminder(to, msg.trim(), preset?.taskId || null, at ? new Date(at).toISOString() : null);
    if (err) toast('发送失败：' + err); else { toast('已提醒'); onClose(); }
  };
  return (
    <Modal open={open} onClose={onClose} title="发提醒">
      <form onSubmit={submit}>
        <div className="f"><label>提醒谁</label>
          <select value={to} onChange={e => setTo(e.target.value)}>
            {others.length === 0 && <option value="">工作区里还没有其他成员</option>}
            {others.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name || m.email}</option>)}
          </select></div>
        <div className="f"><label>内容</label><textarea rows={3} value={msg} onChange={e => setMsg(e.target.value)} required autoFocus placeholder="例如：提案今天要发给客户，麻烦确认一下报价" /></div>
        <div className="f"><label>希望对方什么时候处理（可选）</label><input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} /></div>
        <div className="acts"><button type="button" className="btn" onClick={onClose}>取消</button><button type="submit" className="btn pri" disabled={!others.length}>发送</button></div>
      </form>
    </Modal>
  );
}
