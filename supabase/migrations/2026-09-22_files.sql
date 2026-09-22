-- 文件台：私有桶 files + public.files 元数据（上传件与外链同表）
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null default 'upload' check (kind in ('upload','link')),
  name text not null,
  path text,
  url text,
  mime text not null default '',
  size bigint not null default 0,
  category text not null default 'other' check (category in ('contract','brief','asset','deliverable','report','other')),
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  note text not null default '',
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists files_ws_idx on public.files(workspace_id);
alter table public.files enable row level security;
alter table public.files replica identity full;
drop policy if exists f_select on public.files;
create policy f_select on public.files for select using (is_ws_member(workspace_id));
drop policy if exists f_insert on public.files;
create policy f_insert on public.files for insert with check (is_ws_member(workspace_id) and uploaded_by = auth.uid());
drop policy if exists f_update on public.files;
create policy f_update on public.files for update using (uploaded_by = auth.uid() or is_ws_owner(workspace_id));
drop policy if exists f_delete on public.files;
create policy f_delete on public.files for delete using (uploaded_by = auth.uid() or is_ws_owner(workspace_id));
do $$ begin
  alter publication supabase_realtime add table public.files;
exception when duplicate_object then null; end $$;

-- 对象路径固定为 {workspace_id}/{file_id}-{name}，桶策略按第一段目录判断工作区成员
drop policy if exists files_read on storage.objects;
create policy files_read on storage.objects for select to authenticated
  using (bucket_id = 'files' and is_ws_member(((storage.foldername(name))[1])::uuid));
drop policy if exists files_write on storage.objects;
create policy files_write on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and is_ws_member(((storage.foldername(name))[1])::uuid));
drop policy if exists files_delete on storage.objects;
create policy files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (owner = auth.uid() or is_ws_owner(((storage.foldername(name))[1])::uuid)));

create or replace function public.storage_usage(ws uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(size), 0) from files where workspace_id = ws and kind = 'upload';
$$;
