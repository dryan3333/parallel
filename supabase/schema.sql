-- 平行线 数据库结构与权限规则
-- 在 Supabase 控制台 SQL Editor 里整段执行一次即可。

create extension if not exists pgcrypto;

-- ---------- 表 ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default '我的工作区',
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  type text not null check (type in ('product','ops')),
  goal text not null default '',
  stages jsonb not null default '[]'::jsonb,
  prd text not null default '',
  archived boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  can_edit boolean not null default true,
  primary key (project_id, user_id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  title text not null,
  due date,
  status text not null default 'todo' check (status in ('todo','doing','done')),
  priority text not null default 'normal' check (priority in ('normal','high')),
  note text not null default '',
  assignee_id uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id),
  done_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade,
  message text not null,
  task_id uuid references public.tasks(id) on delete set null,
  remind_at timestamptz,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists tasks_ws_idx on public.tasks(workspace_id);
create index if not exists projects_ws_idx on public.projects(workspace_id);
create index if not exists reminders_to_idx on public.reminders(to_user, read);

-- ---------- 权限判断函数（security definer，避免 RLS 递归） ----------
create or replace function public.is_ws_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members where workspace_id = ws and user_id = auth.uid());
$$;

create or replace function public.is_ws_owner(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members where workspace_id = ws and user_id = auth.uid() and role = 'owner');
$$;

create or replace function public.can_edit_project(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projects p
    where p.id = pid and (
      is_ws_owner(p.workspace_id)
      or exists (select 1 from project_members pm where pm.project_id = pid and pm.user_id = auth.uid() and pm.can_edit)
    )
  );
$$;

-- ---------- 新用户注册：建档案；有邀请则加入工作区，否则自建工作区成为 owner ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv record; ws uuid;
begin
  insert into profiles (id, email, display_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email,''), '@', 1)));

  select * into inv from invitations where lower(email) = lower(coalesce(new.email,'')) order by created_at limit 1;
  if found then
    insert into workspace_members (workspace_id, user_id, role) values (inv.workspace_id, new.id, 'member') on conflict do nothing;
    delete from invitations where lower(email) = lower(coalesce(new.email,''));
  else
    insert into workspaces (owner_id, name) values (new.id, '平行线') returning id into ws;
    insert into workspace_members (workspace_id, user_id, role) values (ws, new.id, 'owner');
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- 已注册用户后来才被邀请：由 owner 发邀请时直接补进成员
create or replace function public.handle_new_invitation() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select id into uid from profiles where lower(email) = lower(new.email) limit 1;
  if uid is not null then
    insert into workspace_members (workspace_id, user_id, role) values (new.workspace_id, uid, 'member') on conflict do nothing;
    delete from invitations where id = new.id;
    return null;
  end if;
  return new;
end;
$$;
drop trigger if exists on_invitation_created on public.invitations;
create trigger on_invitation_created before insert on public.invitations
for each row execute function public.handle_new_invitation();

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();
drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_updated_at();

-- ---------- 行级安全 ----------
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.invitations enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.tasks enable row level security;
alter table public.reminders enable row level security;

-- profiles：同一工作区的人互相可见；只能改自己
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  id = auth.uid() or exists (
    select 1 from workspace_members a join workspace_members b on a.workspace_id = b.workspace_id
    where a.user_id = auth.uid() and b.user_id = profiles.id)
);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (id = auth.uid());

-- workspaces：成员可见；owner 可改
drop policy if exists ws_select on public.workspaces;
create policy ws_select on public.workspaces for select using (is_ws_member(id));
drop policy if exists ws_update on public.workspaces;
create policy ws_update on public.workspaces for update using (is_ws_owner(id));

-- workspace_members：成员可见；owner 可移除成员（不能移除自己）
drop policy if exists wm_select on public.workspace_members;
create policy wm_select on public.workspace_members for select using (is_ws_member(workspace_id));
drop policy if exists wm_delete on public.workspace_members;
create policy wm_delete on public.workspace_members for delete using (is_ws_owner(workspace_id) and user_id <> auth.uid());

-- invitations：只有 owner 能看、发、撤
drop policy if exists inv_all on public.invitations;
create policy inv_all on public.invitations for all using (is_ws_owner(workspace_id)) with check (is_ws_owner(workspace_id) and invited_by = auth.uid());

-- projects：成员可读全部；owner 可建/删；被分配且 can_edit 的成员可改
drop policy if exists pr_select on public.projects;
create policy pr_select on public.projects for select using (is_ws_member(workspace_id));
drop policy if exists pr_insert on public.projects;
create policy pr_insert on public.projects for insert with check (is_ws_owner(workspace_id) and created_by = auth.uid());
drop policy if exists pr_update on public.projects;
create policy pr_update on public.projects for update using (can_edit_project(id));
drop policy if exists pr_delete on public.projects;
create policy pr_delete on public.projects for delete using (is_ws_owner(workspace_id));

-- project_members：成员可读；只有 owner 分配
drop policy if exists pm_select on public.project_members;
create policy pm_select on public.project_members for select using (
  exists (select 1 from projects p where p.id = project_id and is_ws_member(p.workspace_id)));
drop policy if exists pm_write on public.project_members;
create policy pm_write on public.project_members for all using (
  exists (select 1 from projects p where p.id = project_id and is_ws_owner(p.workspace_id)))
  with check (exists (select 1 from projects p where p.id = project_id and is_ws_owner(p.workspace_id)));

-- tasks：成员可读；有项目的任务按项目权限；无项目的任务本人或 owner 可改；被指派的人可改状态
drop policy if exists t_select on public.tasks;
create policy t_select on public.tasks for select using (is_ws_member(workspace_id));
drop policy if exists t_insert on public.tasks;
create policy t_insert on public.tasks for insert with check (
  is_ws_member(workspace_id) and created_by = auth.uid()
  and (project_id is null or can_edit_project(project_id)));
drop policy if exists t_update on public.tasks;
create policy t_update on public.tasks for update using (
  is_ws_owner(workspace_id) or assignee_id = auth.uid()
  or (project_id is null and created_by = auth.uid())
  or (project_id is not null and can_edit_project(project_id)));
drop policy if exists t_delete on public.tasks;
create policy t_delete on public.tasks for delete using (
  is_ws_owner(workspace_id) or (project_id is null and created_by = auth.uid())
  or (project_id is not null and can_edit_project(project_id)));

-- reminders：发给同工作区任何人；收件人和发件人可见；收件人可标已读、删除
drop policy if exists r_select on public.reminders;
create policy r_select on public.reminders for select using (to_user = auth.uid() or from_user = auth.uid());
drop policy if exists r_insert on public.reminders;
create policy r_insert on public.reminders for insert with check (is_ws_member(workspace_id) and from_user = auth.uid());
drop policy if exists r_update on public.reminders;
create policy r_update on public.reminders for update using (to_user = auth.uid());
drop policy if exists r_delete on public.reminders;
create policy r_delete on public.reminders for delete using (to_user = auth.uid() or from_user = auth.uid());

-- ---------- 实时推送 ----------
do $$ begin
  alter publication supabase_realtime add table public.projects;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.tasks;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.reminders;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.project_members;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.workspace_members;
exception when duplicate_object then null; end $$;

-- 定时提醒见 routines.sql，需在本文件之后执行。
