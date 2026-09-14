import { useState } from 'react';
import { useStore } from '../state/store';
import { fmtTime } from '../lib/util';
import { ReminderDialog } from '../components/Dialogs';
import { Routines } from '../components/Routines';

export function Inbox() {
  const { reminders, user, memberName, markRead, deleteReminder, tasks, members } = useStore();
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission>(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  const inbox = reminders.filter(r => r.to_user === user?.id);
  const sent = reminders.filter(r => r.from_user === user?.id);
  const canNotify = typeof Notification !== 'undefined';
  return (
    <>
      <div className="page-h"><h1>提醒</h1><span className="sub">{inbox.filter(r => !r.read).length} 条未读</span><span className="spacer" />
        <button className="btn pri" onClick={() => setOpen(true)} disabled={members.length < 2}>发提醒</button></div>
      {canNotify && perm !== 'granted' && <p className="hint">打开系统通知后，应用开着时收到提醒会弹出。 <button className="btn sm" onClick={async () => setPerm(await Notification.requestPermission())}>打开通知</button></p>}
      <div className="two">
        <div className="panel"><div className="hd"><h2>收到的</h2></div>
          {inbox.length ? <div className="tlist flat">{inbox.map(r => { const t = tasks.find(x => x.id === r.task_id);
            return <div key={r.id} className={`rrow ${r.read ? 'read' : ''}`}>
              <div className="rhead"><b>{memberName(r.from_user)}</b><span className="mono muted">{fmtTime(r.created_at)}</span>{r.remind_at && <span className="tag due">希望 {fmtTime(r.remind_at)} 前</span>}</div>
              <div className="rmsg">{r.message}</div>
              {t && <div className="muted small">关联任务：{t.title}</div>}
              <div className="racts"><button className="btn sm ghost" onClick={() => markRead(r.id, !r.read)}>{r.read ? '标为未读' : '标为已读'}</button><button className="btn sm ghost danger" onClick={() => deleteReminder(r.id)}>删除</button></div>
            </div>; })}</div> : <div className="empty flat">还没有人提醒你</div>}
        </div>
        <div className="panel"><div className="hd"><h2>发出的</h2></div>
          {sent.length ? <div className="tlist flat">{sent.map(r => <div key={r.id} className="rrow read">
            <div className="rhead"><b>给 {memberName(r.to_user)}</b><span className="mono muted">{fmtTime(r.created_at)}</span><span className={`tag ${r.read ? 'who' : 'due today'}`}>{r.read ? '已读' : '未读'}</span></div>
            <div className="rmsg">{r.message}</div></div>)}</div> : <div className="empty flat">还没有发过提醒</div>}
        </div>
      </div>
      <Routines />
      <ReminderDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
