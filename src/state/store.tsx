import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Client, FileRow, Invitation, Member, Project, ProjectMember, Reminder, Routine, Task } from '../lib/types';
import { fmtDue, todayStr } from '../lib/util';

// 更新时不往回写的键：主键、归属和时间戳
const stripMeta = (o: Record<string, unknown>) => {
  const p = { ...o };
  for (const k of ['id', 'workspace_id', 'created_by', 'created_at', 'updated_at']) delete p[k];
  return p;
};
const NO_PERM = '没有权限修改这一条';
const NOT_SAVED = '没保存上，已恢复';

type State = {
  session: Session | null; user: User | null; ready: boolean; today: string;
  wsId: string | null; role: 'owner' | 'member' | null;
  members: Member[]; invitations: Invitation[];
  projects: Project[]; tasks: Task[]; projectMembers: ProjectMember[]; reminders: Reminder[]; routines: Routine[]; clients: Client[]; files: FileRow[];
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
  patchTask: (id: string, patch: Partial<Task>, opts?: { doneNote?: string }) => Promise<boolean>;
  patchProject: (id: string, patch: Partial<Project>) => Promise<boolean>;
  upsertClient: (c: Partial<Client> & { name: string }) => Promise<Client | null>;
  patchClient: (id: string, patch: Partial<Client>) => Promise<boolean>;
  deleteClient: (id: string) => Promise<void>;
  addFile: (f: Partial<FileRow> & { name: string }) => Promise<FileRow | null>;
  patchFile: (id: string, patch: Partial<FileRow>) => Promise<boolean>;
  removeFile: (id: string) => Promise<void>;
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
  const [files, setFiles] = useState<FileRow[]>([]);
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef<number | undefined>(undefined);
  const [today, setToday] = useState(todayStr());
  const todayRef = useRef(today);
  const lastPull = useRef(0);
  const doneNotified = useRef<Set<string>>(new Set());
  const user = session?.user ?? null;

  const toast = useCallback((msg: string) => {
    setToastMsg(msg); window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(''), 1800);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); }).catch(() => setReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadMembership = useCallback(async () => {
    if (!user) { setWsId(null); setRole(null); return null; }
    const { data } = await supabase.from('workspace_members').select('workspace_id, role, created_at').eq('user_id', user.id).order('created_at');
    // 被邀请加入的团队工作区优先于注册时自动生成的个人工作区
    const m = (data || []).find(x => x.role === 'member') || data?.[0];
    if (!m) { setWsId(null); setRole(null); return null; }
    setWsId(m.workspace_id); setRole(m.role); return m.workspace_id as string;
  }, [user]);

  const loadAll = useCallback(async (ws: string) => {
    const [mem, prof, inv, pr, ta, pm, re, ro, cl, fi] = await Promise.all([
      supabase.from('workspace_members').select('user_id, role').eq('workspace_id', ws),
      supabase.from('profiles').select('id, display_name, email'),
      supabase.from('invitations').select('id, email, created_at').eq('workspace_id', ws),
      supabase.from('projects').select('*').eq('workspace_id', ws).order('created_at'),
      supabase.from('tasks').select('*').eq('workspace_id', ws).order('created_at'),
      supabase.from('project_members').select('*'),
      supabase.from('reminders').select('*').eq('workspace_id', ws).order('created_at', { ascending: false }),
      supabase.from('routines').select('*').eq('workspace_id', ws).order('created_at'),
      supabase.from('clients').select('*').eq('workspace_id', ws).order('created_at'),
      supabase.from('files').select('*').eq('workspace_id', ws).order('created_at', { ascending: false }),
    ]);
    lastPull.current = Date.now();
    // 断网或请求失败时保留已有数据，不用空数组覆盖
    if (ta.error || pr.error) { toast('网络不通，显示的是上次的数据'); return; }
    const profs = new Map((prof.data || []).map(p => [p.id, p]));
    if (!mem.error && !prof.error) setMembers((mem.data || []).map(m => ({ user_id: m.user_id, role: m.role, display_name: profs.get(m.user_id)?.display_name || '', email: profs.get(m.user_id)?.email || '' })));
    if (!inv.error) setInvitations(inv.data || []);
    setProjects((pr.data || []) as Project[]);
    setTasks((ta.data || []) as Task[]);
    if (!pm.error) setProjectMembers((pm.data || []) as ProjectMember[]);
    if (!re.error) setReminders((re.data || []) as Reminder[]);
    if (!ro.error) setRoutines((ro.data || []) as Routine[]);
    if (!cl.error) setClients((cl.data || []) as Client[]);
    if (!fi.error) setFiles((fi.data || []) as FileRow[]);
  }, [toast]);

  const reload = useCallback(async () => { const ws = await loadMembership(); if (ws) await loadAll(ws); }, [loadMembership, loadAll]);

  useEffect(() => { if (ready) reload(); }, [ready, user?.id, reload]);

  // 回到前台 / 窗口聚焦 / 恢复联网：重新拉一次（30 秒内不重复）
  useEffect(() => {
    if (!wsId) return;
    const pull = () => {
      if (Date.now() - lastPull.current < 30000) return;
      lastPull.current = Date.now();
      loadAll(wsId);
    };
    const onVis = () => { if (document.visibilityState === 'visible') pull(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', pull);
    window.addEventListener('online', pull);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', pull);
      window.removeEventListener('online', pull);
    };
  }, [wsId, loadAll]);

  // 跨天：每分钟看一眼日期，变了就换「今天」并重拉
  useEffect(() => {
    const timer = window.setInterval(() => {
      const t = todayStr();
      if (t === todayRef.current) return;
      todayRef.current = t; setToday(t);
      if (wsId) loadAll(wsId);
    }, 60000);
    return () => window.clearInterval(timer);
  }, [wsId, loadAll]);

  // 实时：任何变化就重新拉对应的表（数据量小，简单可靠）
  useEffect(() => {
    if (!wsId || !user) return;
    const ch = supabase.channel('ws-' + wsId);
    const timers: Record<string, number> = {};
    let first = true;
    const refetch = (table: string) => () => {
      window.clearTimeout(timers[table]);
      timers[table] = window.setTimeout(() => { doFetch(table); }, 300);
    };
    const doFetch = async (table: string) => {
      if (table === 'projects') { const { data, error } = await supabase.from('projects').select('*').eq('workspace_id', wsId).order('created_at'); if (!error) setProjects((data || []) as Project[]); }
      else if (table === 'tasks') { const { data, error } = await supabase.from('tasks').select('*').eq('workspace_id', wsId).order('created_at'); if (!error) setTasks((data || []) as Task[]); }
      else if (table === 'reminders') { const { data, error } = await supabase.from('reminders').select('*').eq('workspace_id', wsId).order('created_at', { ascending: false }); if (!error) setReminders((data || []) as Reminder[]); }
      else if (table === 'project_members') { const { data, error } = await supabase.from('project_members').select('*'); if (!error) setProjectMembers((data || []) as ProjectMember[]); }
      else if (table === 'clients') { const { data, error } = await supabase.from('clients').select('*').eq('workspace_id', wsId).order('created_at'); if (!error) setClients((data || []) as Client[]); }
      else if (table === 'files') { const { data, error } = await supabase.from('files').select('*').eq('workspace_id', wsId).order('created_at', { ascending: false }); if (!error) setFiles((data || []) as FileRow[]); }
      else if (table === 'routines') { const { data, error } = await supabase.from('routines').select('*').eq('workspace_id', wsId).order('created_at'); if (!error) setRoutines((data || []) as Routine[]); }
      else await loadAll(wsId);
    };
    for (const t of ['projects', 'tasks', 'reminders', 'project_members', 'workspace_members', 'clients', 'routines', 'files']) {
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
    // 断线重连后补拉一次，首次订阅成功不用（刚加载过）
    ch.subscribe(status => {
      if (status !== 'SUBSCRIBED') return;
      if (first) { first = false; return; }
      loadAll(wsId);
    });
    return () => { for (const k of Object.keys(timers)) window.clearTimeout(timers[k]); supabase.removeChannel(ch); };
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
    return m ? (m.display_name || m.email.split('@')[0]) : '';
  }, [members]);

  // 有 id 走 update，没 id 走 insert；update 返回 0 行说明被权限策略挡住了
  const saveRow = async <T,>(table: 'projects' | 'tasks' | 'clients' | 'routines', input: Record<string, unknown>, fix: Record<string, unknown> = {}): Promise<{ row: T | null; err: string | null }> => {
    if (!wsId || !user) return { row: null, err: '未登录' };
    const id = input.id as string | undefined;
    const { data, error } = id
      ? await supabase.from(table).update({ ...stripMeta(input), ...fix }).eq('id', id).select()
      : await supabase.from(table).insert({ ...input, ...fix, workspace_id: wsId, created_by: (input.created_by as string | undefined) || user.id }).select();
    if (error) return { row: null, err: '保存失败：' + error.message };
    if (!data || data.length === 0) return { row: null, err: id ? NO_PERM : '保存失败：没有返回数据' };
    return { row: data[0] as T, err: null };
  };
  const putIn = <T extends { id: string }>(row: T) => (xs: T[]) => { const i = xs.findIndex(x => x.id === row.id); if (i < 0) return [...xs, row]; const n = xs.slice(); n[i] = row; return n; };
  // 乐观更新，失败则把原行写回
  const patchRow = async <T extends { id: string }>(table: 'projects' | 'tasks' | 'clients' | 'files', list: T[], setList: (f: (xs: T[]) => T[]) => void, id: string, patch: Partial<T>): Promise<boolean> => {
    const orig = list.find(x => x.id === id);
    setList(xs => xs.map(x => x.id === id ? { ...x, ...patch } : x));
    const { data, error } = await supabase.from(table).update(patch as Record<string, unknown>).eq('id', id).select('id');
    if (error || !data || data.length === 0) {
      if (orig) setList(xs => xs.map(x => x.id === id ? orig : x));
      toast(NOT_SAVED); return false;
    }
    return true;
  };
  const myName = () => { const me = members.find(m => m.user_id === user?.id); return me?.display_name || me?.email?.split('@')[0] || '同事'; };
  // 别人建的任务被我完成时，回报给创建人（同一任务本次会话只报一次）
  const notifyDone = (task: Task, note?: string) => {
    if (!wsId || !user || !task.created_by || task.created_by === user.id) return;
    if (!members.some(m => m.user_id === task.created_by)) return;
    if (doneNotified.current.has(task.id)) return;
    doneNotified.current.add(task.id);
    const n = note?.trim();
    supabase.from('reminders').insert({ workspace_id: wsId, to_user: task.created_by, from_user: user.id, task_id: task.id,
      message: `${myName()} 完成了：${task.title}${n ? '。' + n : ''}` }).then(() => {}, () => {});
  };

  const upsertProject: Actions['upsertProject'] = async (p) => {
    const { row, err } = await saveRow<Project>('projects', p);
    if (!row) { toast(err || '保存失败'); return null; }
    setProjects(putIn(row));
    return row;
  };
  const deleteProject: Actions['deleteProject'] = async (id) => {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) { toast('删除失败：' + error.message); return; }
    setProjects(ps => ps.filter(p => p.id !== id)); setTasks(ts => ts.filter(t => t.project_id !== id));
  };
  const upsertTask: Actions['upsertTask'] = async (t) => {
    if (!wsId || !user) return null;
    const prev = t.id ? tasks.find(x => x.id === t.id) : undefined;
    // 空字符串规范为 null；更新时只规范入参里带了的键，避免把没传的字段清空
    const fix: Record<string, unknown> = {};
    for (const k of ['project_id', 'due', 'assignee_id'] as const) if (!t.id || k in t) fix[k] = t[k] || null;
    const { row: saved, err } = await saveRow<Task>('tasks', t, fix);
    if (!saved) { toast(err || '保存失败'); return null; }
    setTasks(putIn(saved));
    if (saved.assignee_id && saved.assignee_id !== user.id && saved.assignee_id !== prev?.assignee_id) {
      supabase.from('reminders').insert({ workspace_id: wsId, to_user: saved.assignee_id, from_user: user.id, task_id: saved.id,
        message: `${myName()} 给你指派了任务：${saved.title}${saved.due ? '，截止 ' + fmtDue(saved.due) : ''}` }).then(() => {});
    }
    if (prev && prev.status !== 'done' && saved.status === 'done') notifyDone(saved);
    return saved;
  };
  const deleteTask: Actions['deleteTask'] = async (id) => {
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) { toast('删除失败：' + error.message); return; }
    setTasks(ts => ts.filter(t => t.id !== id));
  };
  const patchTask: Actions['patchTask'] = async (id, patch, opts) => {
    const orig = tasks.find(t => t.id === id);
    const ok = await patchRow<Task>('tasks', tasks, setTasks, id, patch);
    if (ok && orig && orig.status !== 'done' && patch.status === 'done') notifyDone(orig, opts?.doneNote);
    return ok;
  };
  const patchProject: Actions['patchProject'] = (id, patch) => patchRow<Project>('projects', projects, setProjects, id, patch);
  const upsertClient: Actions['upsertClient'] = async (c) => {
    const { row, err } = await saveRow<Client>('clients', c);
    if (!row) { toast(err || '保存失败'); return null; }
    setClients(putIn(row));
    return row;
  };
  const patchClient: Actions['patchClient'] = (id, patch) => patchRow<Client>('clients', clients, setClients, id, patch);
  const deleteClient: Actions['deleteClient'] = async (id) => {
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) { toast('删除失败：' + error.message); return; }
    setClients(cs => cs.filter(c => c.id !== id));
  };
  const addFile: Actions['addFile'] = async (f) => {
    if (!wsId || !user) return null;
    const { data, error } = await supabase.from('files').insert({ ...f, workspace_id: wsId, uploaded_by: user.id }).select().single();
    if (error) { toast('保存失败：' + error.message); return null; }
    setFiles(fs => [data as FileRow, ...fs.filter(x => x.id !== data.id)]); return data as FileRow;
  };
  const patchFile: Actions['patchFile'] = (id, patch) => patchRow<FileRow>('files', files, setFiles, id, patch);
  const removeFile: Actions['removeFile'] = async (id) => {
    const { error } = await supabase.from('files').delete().eq('id', id);
    if (error) { toast('删除失败：' + error.message); return; }
    setFiles(fs => fs.filter(f => f.id !== id));
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
  const loadReminders = async () => { if (!wsId) return; const { data, error } = await supabase.from('reminders').select('*').eq('workspace_id', wsId).order('created_at', { ascending: false }); if (!error) setReminders((data || []) as Reminder[]); };
  const sendReminder: Actions['sendReminder'] = async (to, message, taskId = null, remindAt = null) => {
    if (!wsId || !user) return '未登录';
    const { error } = await supabase.from('reminders').insert({ workspace_id: wsId, to_user: to, from_user: user.id, message, task_id: taskId, remind_at: remindAt });
    if (error) return error.message;
    await loadReminders();
    return null;
  };
  const markRead: Actions['markRead'] = async (id, read = true) => {
    setReminders(rs => rs.map(r => r.id === id ? { ...r, read } : r));
    const { error } = await supabase.from('reminders').update({ read }).eq('id', id);
    if (error) { await loadReminders(); toast(NOT_SAVED); }
  };
  const deleteReminder: Actions['deleteReminder'] = async (id) => {
    setReminders(rs => rs.filter(r => r.id !== id));
    const { error } = await supabase.from('reminders').delete().eq('id', id);
    if (error) { await loadReminders(); toast(NOT_SAVED); }
  };
  const loadRoutines = async () => { if (!wsId) return; const { data, error } = await supabase.from('routines').select('*').eq('workspace_id', wsId).order('created_at'); if (!error) setRoutines((data || []) as Routine[]); };
  const upsertRoutine: Actions['upsertRoutine'] = async (r) => {
    if (!wsId || !user) return '未登录';
    const { row, err } = await saveRow<Routine>('routines', r);
    if (!row) return err || '保存失败';
    await loadRoutines(); return null;
  };
  const deleteRoutine: Actions['deleteRoutine'] = async (id) => {
    setRoutines(rs => rs.filter(r => r.id !== id));
    const { error } = await supabase.from('routines').delete().eq('id', id);
    if (error) { await loadRoutines(); toast(NOT_SAVED); }
  };
  const updateName: Actions['updateName'] = async (name) => { if (!user) return; await supabase.from('profiles').update({ display_name: name }).eq('id', user.id); if (wsId) await loadAll(wsId); };

  const value = useMemo<State & Actions>(() => ({
    session, user, ready, today, wsId, role, members, invitations, projects, tasks, projectMembers, reminders, routines, clients, files,
    reload, canEdit, canEditTask, memberName, upsertProject, deleteProject, upsertTask, deleteTask, patchTask, patchProject, upsertClient, patchClient, deleteClient, addFile, patchFile, removeFile, invite, revokeInvite, removeMember,
    setProjectMember, sendReminder, markRead, deleteReminder, upsertRoutine, deleteRoutine, updateName, toast, toastMsg,
  }), [session, user, ready, today, wsId, role, members, invitations, projects, tasks, projectMembers, reminders, routines, clients, files, reload, canEdit, canEditTask, memberName, toast, toastMsg]); // eslint-disable-line
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
