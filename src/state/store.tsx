import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Client, Invitation, Member, Project, ProjectMember, Reminder, Routine, Task } from '../lib/types';
import { fmtDue } from '../lib/util';

type State = {
  session: Session | null; user: User | null; ready: boolean;
  wsId: string | null; role: 'owner' | 'member' | null;
  members: Member[]; invitations: Invitation[];
  projects: Project[]; tasks: Task[]; projectMembers: ProjectMember[]; reminders: Reminder[]; routines: Routine[]; clients: Client[];
};
type Actions = {
  reload: () => Promise<void>;
  canEdit: (projectId: string | null) => boolean;
  canEditTask: (t: Task) => boolean;
  memberName: (uid: string | null | undefined) => string;
  upsertProject: (p: Partial<Project> & { name: string; type: Project['type'] }) => Promise<Project | null>;
  deleteProject: (id: string) => Promise<void>;
  upsertTask: (t: Partial<Task> & { title: string }) => Promise<Task | null>;
  deleteTask: (id: string) => Promise<void>;
  patchTask: (id: string, patch: Partial<Task>) => Promise<boolean>;
  patchProject: (id: string, patch: Partial<Project>) => Promise<boolean>;
  upsertClient: (c: Partial<Client> & { name: string }) => Promise<Client | null>;
  patchClient: (id: string, patch: Partial<Client>) => Promise<boolean>;
  deleteClient: (id: string) => Promise<void>;
  invite: (email: string) => Promise<string | null>;
  revokeInvite: (id: string) => Promise<void>;
  removeMember: (uid: string) => Promise<void>;
  setProjectMember: (projectId: string, uid: string, on: boolean) => Promise<void>;
  sendReminder: (to: string, message: string, taskId?: string | null, remindAt?: string | null) => Promise<string | null>;
  markRead: (id: string, read?: boolean) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
  upsertRoutine: (r: Partial<Routine> & { to_user: string; message: string }) => Promise<string | null>;
  deleteRoutine: (id: string) => Promise<void>;
  updateName: (name: string) => Promise<void>;
  toast: (msg: string) => void;
  toastMsg: string;
};
const Ctx = createContext<(State & Actions) | null>(null);
export const useStore = () => { const c = useContext(Ctx); if (!c) throw new Error('store'); return c; };

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [wsId, setWsId] = useState<string | null>(null);
  const [role, setRole] = useState<'owner' | 'member' | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef<number | undefined>(undefined);
  const user = session?.user ?? null;

  const toast = useCallback((msg: string) => {
    setToastMsg(msg); window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(''), 1800);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadMembership = useCallback(async () => {
    if (!user) { setWsId(null); setRole(null); return null; }
    const { data } = await supabase.from('workspace_members').select('workspace_id, role').eq('user_id', user.id).order('created_at').limit(1);
    const m = data?.[0];
    if (!m) { setWsId(null); setRole(null); return null; }
    setWsId(m.workspace_id); setRole(m.role); return m.workspace_id as string;
  }, [user]);

  const loadAll = useCallback(async (ws: string) => {
    const [mem, prof, inv, pr, ta, pm, re, ro, cl] = await Promise.all([
      supabase.from('workspace_members').select('user_id, role').eq('workspace_id', ws),
      supabase.from('profiles').select('id, display_name, email'),
      supabase.from('invitations').select('id, email, created_at').eq('workspace_id', ws),
      supabase.from('projects').select('*').eq('workspace_id', ws).order('created_at'),
      supabase.from('tasks').select('*').eq('workspace_id', ws).order('created_at'),
      supabase.from('project_members').select('*'),
      supabase.from('reminders').select('*').eq('workspace_id', ws).order('created_at', { ascending: false }),
      supabase.from('routines').select('*').eq('workspace_id', ws).order('created_at'),
      supabase.from('clients').select('*').eq('workspace_id', ws).order('created_at'),
    ]);
    const profs = new Map((prof.data || []).map(p => [p.id, p]));
    setMembers((mem.data || []).map(m => ({ user_id: m.user_id, role: m.role, display_name: profs.get(m.user_id)?.display_name || '', email: profs.get(m.user_id)?.email || '' })));
    setInvitations(inv.data || []);
    setProjects((pr.data || []) as Project[]);
    setTasks((ta.data || []) as Task[]);
    setProjectMembers((pm.data || []) as ProjectMember[]);
    setReminders((re.data || []) as Reminder[]);
    setRoutines((ro.data || []) as Routine[]);
    setClients((cl.data || []) as Client[]);
  }, []);

  const reload = useCallback(async () => { const ws = await loadMembership(); if (ws) await loadAll(ws); }, [loadMembership, loadAll]);

  useEffect(() => { if (ready) reload(); }, [ready, user?.id, reload]);

  // 实时：任何变化就重新拉对应的表（数据量小，简单可靠）
  useEffect(() => {
    if (!wsId || !user) return;
    const ch = supabase.channel('ws-' + wsId);
    const refetch = (table: string) => async () => {
      if (table === 'projects') { const { data } = await supabase.from('projects').select('*').eq('workspace_id', wsId).order('created_at'); setProjects((data || []) as Project[]); }
      else if (table === 'tasks') { const { data } = await supabase.from('tasks').select('*').eq('workspace_id', wsId).order('created_at'); setTasks((data || []) as Task[]); }
      else if (table === 'reminders') { const { data } = await supabase.from('reminders').select('*').eq('workspace_id', wsId).order('created_at', { ascending: false }); setReminders((data || []) as Reminder[]); }
      else if (table === 'project_members') { const { data } = await supabase.from('project_members').select('*'); setProjectMembers((data || []) as ProjectMember[]); }
      else if (table === 'clients') { const { data } = await supabase.from('clients').select('*').eq('workspace_id', wsId).order('created_at'); setClients((data || []) as Client[]); }
      else if (table === 'routines') { const { data } = await supabase.from('routines').select('*').eq('workspace_id', wsId).order('created_at'); setRoutines((data || []) as Routine[]); }
      else await loadAll(wsId);
    };
    for (const t of ['projects', 'tasks', 'reminders', 'project_members', 'workspace_members', 'clients', 'routines']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, (payload) => {
        refetch(t)();
        if (t === 'reminders' && payload.eventType === 'INSERT') {
          const r = payload.new as Reminder;
          if (r.to_user === user.id && 'Notification' in window && Notification.permission === 'granted') {
            const show = async () => {
              try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) { await reg.showNotification('平行线提醒', { body: r.message }); return; } } catch { /* fall through */ }
              try { new Notification('平行线提醒', { body: r.message }); } catch { /* ignore */ }
            };
            show();
          }
        }
      });
    }
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [wsId, user?.id, loadAll]);

  const isOwner = role === 'owner';
  const canEdit = useCallback((projectId: string | null) => {
    if (!user) return false; if (isOwner) return true; if (!projectId) return true;
    if (projects.find(p => p.id === projectId)?.created_by === user.id) return true;
    return projectMembers.some(pm => pm.project_id === projectId && pm.user_id === user.id && pm.can_edit);
  }, [user, isOwner, projectMembers, projects]);
  const canEditTask = useCallback((t: Task) => {
    if (!user) return false; if (isOwner || t.assignee_id === user.id) return true;
    if (!t.project_id) return t.created_by === user.id;
    return canEdit(t.project_id);
  }, [user, isOwner, canEdit]);
  const memberName = useCallback((uid: string | null | undefined) => {
    if (!uid) return ''; const m = members.find(x => x.user_id === uid);
    return m ? (m.display_name || m.email.split('@')[0]) : '成员';
  }, [members]);

  const upsertProject: Actions['upsertProject'] = async (p) => {
    if (!wsId || !user) return null;
    const row = { ...p, workspace_id: wsId, created_by: p.created_by || user.id };
    const { data, error } = await supabase.from('projects').upsert(row).select().single();
    if (error) { toast('保存失败：' + error.message); return null; }
    setProjects(ps => { const i = ps.findIndex(x => x.id === data.id); if (i < 0) return [...ps, data as Project]; const n = ps.slice(); n[i] = data as Project; return n; });
    return data as Project;
  };
  const deleteProject: Actions['deleteProject'] = async (id) => {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) { toast('删除失败：' + error.message); return; }
    setProjects(ps => ps.filter(p => p.id !== id)); setTasks(ts => ts.filter(t => t.project_id !== id));
  };
  const upsertTask: Actions['upsertTask'] = async (t) => {
    if (!wsId || !user) return null;
    const row = { ...t, workspace_id: wsId, created_by: t.created_by || user.id, project_id: t.project_id || null, due: t.due || null, assignee_id: t.assignee_id || null };
    const prev = t.id ? tasks.find(x => x.id === t.id) : undefined;
    const { data, error } = await supabase.from('tasks').upsert(row).select().single();
    if (error) { toast('保存失败：' + error.message); return null; }
    setTasks(ts => { const i = ts.findIndex(x => x.id === data.id); if (i < 0) return [...ts, data as Task]; const n = ts.slice(); n[i] = data as Task; return n; });
    const saved = data as Task;
    if (saved.assignee_id && saved.assignee_id !== user.id && saved.assignee_id !== prev?.assignee_id) {
      const me = members.find(m => m.user_id === user.id); const myName = me?.display_name || me?.email?.split('@')[0] || '同事';
      supabase.from('reminders').insert({ workspace_id: wsId, to_user: saved.assignee_id, from_user: user.id, task_id: saved.id,
        message: `${myName} 给你指派了任务：${saved.title}${saved.due ? '，截止 ' + fmtDue(saved.due) : ''}` }).then(() => {});
    }
    return saved;
  };
  const deleteTask: Actions['deleteTask'] = async (id) => {
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) { toast('删除失败：' + error.message); return; }
    setTasks(ts => ts.filter(t => t.id !== id));
  };
  const patchTask: Actions['patchTask'] = async (id, patch) => {
    setTasks(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t));
    const { error } = await supabase.from('tasks').update(patch).eq('id', id);
    if (error) { toast('保存失败：' + error.message); return false; } return true;
  };
  const patchProject: Actions['patchProject'] = async (id, patch) => {
    setProjects(ps => ps.map(p => p.id === id ? { ...p, ...patch } : p));
    const { error } = await supabase.from('projects').update(patch).eq('id', id);
    if (error) { toast('保存失败：' + error.message); return false; } return true;
  };
  const upsertClient: Actions['upsertClient'] = async (c) => {
    if (!wsId || !user) return null;
    const row = { ...c, workspace_id: wsId, created_by: c.created_by || user.id };
    const { data, error } = await supabase.from('clients').upsert(row).select().single();
    if (error) { toast('保存失败：' + error.message); return null; }
    setClients(cs => { const i = cs.findIndex(x => x.id === data.id); if (i < 0) return [...cs, data as Client]; const n = cs.slice(); n[i] = data as Client; return n; });
    return data as Client;
  };
  const patchClient: Actions['patchClient'] = async (id, patch) => {
    setClients(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c));
    const { error } = await supabase.from('clients').update(patch).eq('id', id);
    if (error) { toast('保存失败：' + error.message); return false; } return true;
  };
  const deleteClient: Actions['deleteClient'] = async (id) => {
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) { toast('删除失败：' + error.message); return; }
    setClients(cs => cs.filter(c => c.id !== id));
  };
  const invite: Actions['invite'] = async (email) => {
    if (!wsId || !user) return '未登录';
    const { error } = await supabase.from('invitations').insert({ workspace_id: wsId, email: email.trim().toLowerCase(), invited_by: user.id });
    if (error) return error.message;
    await loadAll(wsId); return null;
  };
  const revokeInvite: Actions['revokeInvite'] = async (id) => { await supabase.from('invitations').delete().eq('id', id); if (wsId) await loadAll(wsId); };
  const removeMember: Actions['removeMember'] = async (uid) => {
    if (!wsId) return; const { error } = await supabase.from('workspace_members').delete().eq('workspace_id', wsId).eq('user_id', uid);
    if (error) toast('移除失败：' + error.message); else await loadAll(wsId);
  };
  const setProjectMember: Actions['setProjectMember'] = async (projectId, uid, on) => {
    const q = on ? supabase.from('project_members').upsert({ project_id: projectId, user_id: uid, can_edit: true })
      : supabase.from('project_members').delete().eq('project_id', projectId).eq('user_id', uid);
    const { error } = await q; if (error) { toast('分配失败：' + error.message); return; }
    const { data } = await supabase.from('project_members').select('*'); setProjectMembers((data || []) as ProjectMember[]);
  };
  const sendReminder: Actions['sendReminder'] = async (to, message, taskId = null, remindAt = null) => {
    if (!wsId || !user) return '未登录';
    const { error } = await supabase.from('reminders').insert({ workspace_id: wsId, to_user: to, from_user: user.id, message, task_id: taskId, remind_at: remindAt });
    if (error) return error.message;
    const { data } = await supabase.from('reminders').select('*').eq('workspace_id', wsId).order('created_at', { ascending: false }); setReminders((data || []) as Reminder[]);
    return null;
  };
  const markRead: Actions['markRead'] = async (id, read = true) => {
    setReminders(rs => rs.map(r => r.id === id ? { ...r, read } : r));
    await supabase.from('reminders').update({ read }).eq('id', id);
  };
  const deleteReminder: Actions['deleteReminder'] = async (id) => { setReminders(rs => rs.filter(r => r.id !== id)); await supabase.from('reminders').delete().eq('id', id); };
  const loadRoutines = async () => { if (!wsId) return; const { data } = await supabase.from('routines').select('*').eq('workspace_id', wsId).order('created_at'); setRoutines((data || []) as Routine[]); };
  const upsertRoutine: Actions['upsertRoutine'] = async (r) => {
    if (!wsId || !user) return '未登录';
    const { error } = await supabase.from('routines').upsert({ ...r, workspace_id: wsId, created_by: r.created_by || user.id });
    if (error) return error.message;
    await loadRoutines(); return null;
  };
  const deleteRoutine: Actions['deleteRoutine'] = async (id) => { setRoutines(rs => rs.filter(r => r.id !== id)); await supabase.from('routines').delete().eq('id', id); };
  const updateName: Actions['updateName'] = async (name) => { if (!user) return; await supabase.from('profiles').update({ display_name: name }).eq('id', user.id); if (wsId) await loadAll(wsId); };

  const value = useMemo<State & Actions>(() => ({
    session, user, ready, wsId, role, members, invitations, projects, tasks, projectMembers, reminders, routines, clients,
    reload, canEdit, canEditTask, memberName, upsertProject, deleteProject, upsertTask, deleteTask, patchTask, patchProject, upsertClient, patchClient, deleteClient, invite, revokeInvite, removeMember,
    setProjectMember, sendReminder, markRead, deleteReminder, upsertRoutine, deleteRoutine, updateName, toast, toastMsg,
  }), [session, user, ready, wsId, role, members, invitations, projects, tasks, projectMembers, reminders, routines, clients, reload, canEdit, canEditTask, memberName, toast, toastMsg]); // eslint-disable-line
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
