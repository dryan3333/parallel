export type ProjectType = 'product' | 'ops';
export type Status = 'todo' | 'doing' | 'done';
export type Stage = { name: string; due: string; done: boolean };

export type Project = {
  id: string; workspace_id: string; name: string; type: ProjectType; goal: string; client_id: string | null;
  stages: Stage[]; prd: string; archived: boolean; created_by: string; created_at: string; updated_at: string;
};
export type Task = {
  id: string; workspace_id: string; project_id: string | null; title: string; due: string | null;
  status: Status; priority: 'normal' | 'high'; note: string; assignee_id: string | null; created_by: string; client_id: string | null;
  done_at: string | null; created_at: string; updated_at: string;
};
export type Member = { user_id: string; role: 'owner' | 'member'; display_name: string; email: string };
export type ProjectMember = { project_id: string; user_id: string; can_edit: boolean };
export type Reminder = {
  id: string; workspace_id: string; to_user: string; from_user: string; message: string;
  task_id: string | null; remind_at: string | null; read: boolean; created_at: string;
};
export type Invitation = { id: string; email: string; created_at: string };
export type Routine = {
  id: string; workspace_id: string; to_user: string; created_by: string; message: string;
  hour: number; minute: number; weekdays: number[]; tz: string; active: boolean; last_fired: string | null; created_at: string;
  kind: 'message' | 'task'; client_id: string | null;
};
export type ClientStage = 'lead' | 'active' | 'paused' | 'churned';
export type ClientLink = { label: string; url: string };
export type ClientContact = { name: string; role: string; phone: string; email: string; wechat: string };
export type Client = {
  id: string; workspace_id: string; name: string; industry: string; stage: ClientStage; channels: string[];
  contacts: ClientContact[]; links: ClientLink[]; note: string; log: string; owner_id: string | null; archived: boolean;
  created_by: string; created_at: string; updated_at: string;
};
