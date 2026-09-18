-- 第一阶段最小闭环：客户表、权限放开（D1/D2）、例行任务、实时删除修复
-- 在 Supabase SQL Editor 执行一次（需已执行 schema.sql 与 routines.sql）。

-- ---------- 客户 ----------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  industry text not null default '',
  stage text not null default 'active' check (stage in ('lead','active','paused','churned')),
  channels text[] not null default '{}',
  contacts jsonb not null default '[]'::jsonb,
  links jsonb not null default '[]'::jsonb,
  note text not null default '',
  log text not null default '',
  owner_id uuid references auth.users(id) on delete set null,
  archived boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clients_ws_idx on public.clients(workspace_id);
drop trigger if exists clients_touch on public.clients;
create trigger clients_touch before update on public.clients for each row execute function public.touch_updated_at();

alter table public.clients enable row level security;
-- D1：客户档案对工作区成员全可读可写；删除仅 owner
drop policy if exists cl_select on public.clients;
create policy cl_select on public.clients for select using (is_ws_member(workspace_id));
drop policy if exists cl_insert on public.clients;
create policy cl_insert on public.clients for insert with check (is_ws_member(workspace_id) and created_by = auth.uid());
drop policy if exists cl_update on public.clients;
create policy cl_update on public.clients for update using (is_ws_member(workspace_id));
drop policy if exists cl_delete on public.clients;
create policy cl_delete on public.clients for delete using (is_ws_owner(workspace_id));

-- ---------- 回链 ----------
alter table public.projects add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.tasks add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.routines add column if not exists kind text not null default 'message' check (kind in ('message','task'));
alter table public.routines add column if not exists client_id uuid references public.clients(id) on delete set null;

-- ---------- D2：成员可新建运营线 campaign；创建者可编辑自己建的项目 ----------
drop policy if exists pr_insert on public.projects;
create policy pr_insert on public.projects for insert with check (
  is_ws_member(workspace_id) and created_by = auth.uid() and (type = 'ops' or is_ws_owner(workspace_id)));

create or replace function public.can_edit_project(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projects p
    where p.id = pid and (
      is_ws_owner(p.workspace_id)
      or p.created_by = auth.uid()
      or exists (select 1 from project_members pm where pm.project_id = pid and pm.user_id = auth.uid() and pm.can_edit)
    )
  );
$$;

-- ---------- 例行任务：kind='task' 的定时规则到点生成一条待办而不是消息 ----------
create or replace function public.run_routines() returns int
language plpgsql security definer set search_path = public as $$
declare r record; local_now timestamp; fired int := 0;
begin
  for r in select * from routines where active loop
    local_now := now() at time zone r.tz;
    if extract(dow from local_now)::int = any(r.weekdays)
       and (extract(hour from local_now)::int * 60 + extract(minute from local_now)::int) >= r.hour * 60 + r.minute
       and (r.last_fired is null or r.last_fired < local_now::date) then
      if r.kind = 'task' then
        insert into tasks (workspace_id, title, due, status, priority, note, assignee_id, created_by, client_id)
        values (r.workspace_id, r.message, local_now::date, 'todo', 'normal', '例行任务', r.to_user, r.created_by, r.client_id);
      else
        insert into reminders (workspace_id, to_user, from_user, message, remind_at)
        values (r.workspace_id, r.to_user, r.created_by, r.message, now());
      end if;
      update routines set last_fired = local_now::date where id = r.id;
      fired := fired + 1;
    end if;
  end loop;
  return fired;
end;
$$;

-- ---------- 实时：DELETE 事件带完整旧行，前端按工作区过滤时才能收到 ----------
alter table public.projects replica identity full;
alter table public.tasks replica identity full;
alter table public.reminders replica identity full;
alter table public.routines replica identity full;
alter table public.project_members replica identity full;
alter table public.clients replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.clients;
exception when duplicate_object then null; end $$;
