-- 例行任务不再每天堆一条：昨天没勾掉的同一条，今天顺延到今天而不是再生成一条
alter table public.tasks add column if not exists routine_id uuid references public.routines(id) on delete set null;
create index if not exists tasks_routine_idx on public.tasks(routine_id) where routine_id is not null;

create or replace function public.run_routines() returns int
language plpgsql security definer set search_path = public as $$
declare r record; local_now timestamp; fired int := 0; existing uuid;
begin
  for r in select * from routines where active loop
    local_now := now() at time zone r.tz;
    if extract(dow from local_now)::int = any(r.weekdays)
       and (extract(hour from local_now)::int * 60 + extract(minute from local_now)::int) >= r.hour * 60 + r.minute
       and (r.last_fired is null or r.last_fired < local_now::date) then
      if r.kind = 'task' then
        select id into existing from tasks where routine_id = r.id and status <> 'done' order by created_at desc limit 1;
        if existing is not null then
          update tasks set due = local_now::date where id = existing;
        else
          insert into tasks (workspace_id, title, due, status, priority, note, assignee_id, created_by, client_id, routine_id)
          values (r.workspace_id, r.message, local_now::date, 'todo', 'normal', '例行任务', r.to_user, r.created_by, r.client_id, r.id);
        end if;
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

-- 把已经堆出来的重复例行任务合并：同一标题、同一负责人、未完成的只留最新一条并挂上 routine_id
with dup as (
  select t.id, t.title, t.assignee_id, r.id as rid,
         row_number() over (partition by t.title, t.assignee_id order by t.created_at desc) as rn
  from tasks t join routines r on r.message = t.title and r.to_user = t.assignee_id and r.kind = 'task'
  where t.status <> 'done' and t.note = '例行任务'
)
update tasks set routine_id = dup.rid, due = (now() at time zone 'Australia/Sydney')::date from dup where tasks.id = dup.id and dup.rn = 1;
