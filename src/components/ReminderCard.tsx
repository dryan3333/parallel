import { useState } from 'react';
import { useStore } from '../state/store';
import type { Reminder } from '../lib/types';
import { fmtTime, todayStr } from '../lib/util';
import { ReminderDialog } from './Dialogs';

/* 收件箱卡片抄 Linear Inbox：一条一卡，动作就在卡上：转为任务 / 回复 / 已读 */
export function ReminderCard({ r }: { r: Reminder }) {
  const { memberName, markRead, deleteReminder, upsertTask, user, tasks, toast } = useStore();
  const [reply, setReply] = useState(false);
  const linked = tasks.find(x => x.id === r.task_id);
  const toTask = async () => {
    const t = await upsertTask({ title: r.message.slice(0, 80), due: r.remind_at ? r.remind_at.slice(0, 10) : todayStr(), status: 'todo', priority: 'normal', note: `来自 ${memberName(r.from_user)} 的提醒`, assignee_id: user?.id || null });
    if (t) { await markRead(r.id, true); toast('已转为今天的任务'); }
  };
  return (
    <div className={`rcard ${r.read ? 'read' : ''}`}>
      <div className="rhead"><b>{memberName(r.from_user)}</b><span className="mono muted">{fmtTime(r.created_at)}</span>{r.remind_at && <span className="tag due">希望 {fmtTime(r.remind_at)} 前</span>}{!r.read && <span className="dot" />}</div>
      <div className="rmsg">{r.message}</div>
      {linked && <div className="muted small">关联任务：{linked.title}</div>}
      <div className="racts">
        {!r.read && <button className="btn sm" onClick={toTask}>转为任务</button>}
        <button className="btn sm ghost" onClick={() => setReply(true)}>回复</button>
        <button className="btn sm ghost" onClick={() => markRead(r.id, !r.read)}>{r.read ? '标为未读' : '已读'}</button>
        <button className="btn sm ghost danger" onClick={() => deleteReminder(r.id)}>删除</button>
      </div>
      <ReminderDialog open={reply} onClose={() => setReply(false)} preset={{ to: r.from_user, message: `回复「${r.message.slice(0, 30)}」：` }} />
    </div>
  );
}
