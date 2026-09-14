-- 定时提醒：每天到点自动往 reminders 里生成一条提醒
-- 在 Supabase SQL Editor 里整段执行一次（在 schema.sql 之后）。

create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  message text not null,
  hour int not null default 9 check (hour between 0 and 23),
  minute int not null default 0 check (minute between 0 and 59),
  weekdays int[] not null default '{1,2,3,4,5}',
  tz text not null default 'Australia/Sydney',
  active boolean not null default true,
  last_fired date,
  created_at timestamptz not null default now()
);
create index if not exists routines_ws_idx on public.routines(workspace_id);

alter table public.routines enable row level security;
drop policy if exists ro_select on public.routines;
create policy ro_select on public.routines for select using (is_ws_member(workspace_id));
drop policy if exists ro_insert on public.routines;
create policy ro_insert on public.routines for insert with check (is_ws_member(workspace_id) and created_by = auth.uid());
drop policy if exists ro_update on public.routines;
create policy ro_update on public.routines for update using (created_by = auth.uid() or is_ws_owner(workspace_id));
drop policy if exists ro_delete on public.routines;
create policy ro_delete on public.routines for delete using (created_by = auth.uid() or is_ws_owner(workspace_id));

-- 每次调用：对每条启用的定时提醒，若今天（按其时区）是选中的周几、已过设定时间、且今天还没发过，就生成一条提醒
create or replace function public.run_routines() returns int
language plpgsql security definer set search_path = public as $$
declare r record; local_now timestamp; fired int := 0;
begin
  for r in select * from routines where active loop
    local_now := now() at time zone r.tz;
    if extract(dow from local_now)::int = any(r.weekdays)
       and (extract(hour from local_now)::int * 60 + extract(minute from local_now)::int) >= r.hour * 60 + r.minute
       and (r.last_fired is null or r.last_fired < local_now::date) then
      insert into reminders (workspace_id, to_user, from_user, message, remind_at)
      values (r.workspace_id, r.to_user, r.created_by, r.message, now());
      update routines set last_fired = local_now::date where id = r.id;
      fired := fired + 1;
    end if;
  end loop;
  return fired;
end;
$$;

-- 每 10 分钟跑一次
create extension if not exists pg_cron with schema pg_catalog;
do $$ begin
  perform cron.unschedule('parallel-routines');
exception when others then null; end $$;
select cron.schedule('parallel-routines', '*/10 * * * *', 'select public.run_routines()');

do $$ begin
  alter publication supabase_realtime add table public.routines;
exception when duplicate_object then null; end $$;
