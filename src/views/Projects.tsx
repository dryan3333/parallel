import { useState } from 'react';
import { useStore } from '../state/store';
import type { Project, ProjectType } from '../lib/types';
import { TYPES } from '../lib/util';
import { Stepper } from '../components/Stepper';
import { ProjectDialog } from '../components/Dialogs';

export function Projects() {
  const { projects, tasks, role, projectMembers, memberName, upsertProject, toast } = useStore();
  const [edit, setEdit] = useState<Partial<Project> | null>(null);
  const isOwner = role === 'owner';
  const Lane = ({ type }: { type: ProjectType }) => {
    const items = projects.filter(p => p.type === type && !p.archived);
    return (
      <div className={`lane ${type}`}>
        <h2>{TYPES[type]}线 <span className="n">{items.length}</span><span className="spacer" />{isOwner && <button className="btn sm" onClick={() => setEdit({ type })}>+ 新建</button>}</h2>
        <div className="list">
          {items.map(p => { const open = tasks.filter(x => x.project_id === p.id && x.status !== 'done').length; const who = projectMembers.filter(pm => pm.project_id === p.id).map(pm => memberName(pm.user_id));
            return (<a key={p.id} className={`pcard ${type} thin`} href={`#p/${p.id}`}><h3>{p.name}</h3>
              {p.goal && <div className="muted small">{p.goal}</div>}
              <Stepper p={p} mini />
              <div className="meta"><span className="mono">{open} 个待办</span><span className="mono">{who.length ? '协作：' + who.join('、') : ''}</span><span className="mono">PRD {p.prd?.length ? Math.round(p.prd.length / 100) / 10 + 'k 字' : '未写'}</span></div></a>); })}
          {!items.length && <div className="empty">这条线上还没有项目</div>}
        </div>
      </div>);
  };
  const archived = projects.filter(p => p.archived);
  return (
    <>
      <div className="page-h"><h1>项目</h1><span className="sub">两条线并行：产品走需求到上线，运营走策划到复盘</span></div>
      <div className="two"><Lane type="product" /><Lane type="ops" /></div>
      {archived.length > 0 && <div className="section" style={{ marginTop: 26 }}><h2>已归档<span className="n">{archived.length}</span></h2>
        <div className="chips">{archived.map(p => <button key={p.id} className="chip" onClick={async () => { if (!isOwner) return; await upsertProject({ ...p, archived: false }); toast('已恢复'); }}>{p.name}{isOwner ? ' · 恢复' : ''}</button>)}</div></div>}
      <ProjectDialog project={edit} onClose={() => setEdit(null)} />
    </>
  );
}
