import type { Project, ProjectType, Stage } from './types';

export const TYPES: Record<ProjectType, string> = { product: '产品', ops: '运营' };
export const STAGE_TPL: Record<ProjectType, string[]> = {
  product: ['需求收集', 'PRD', '评审', '开发', '验收', '上线'],
  ops: ['策划', '准备', '执行', '复盘'],
};
export const PRD_TPL: Record<ProjectType, string> = {
  product: `# {name}

## 1. 背景
为什么要做这件事？现在的问题是什么？

## 2. 目标与成功指标
- 目标：
- 指标：

## 3. 用户与场景
| 用户 | 场景 | 痛点 |
|---|---|---|
|  |  |  |

## 4. 功能需求
### 4.1
- 描述：
- 优先级：P0 / P1 / P2

## 5. 非功能需求
性能、安全、兼容、数据。

## 6. 里程碑
- [ ] PRD 评审
- [ ] 开发完成
- [ ] 验收
- [ ] 上线

## 7. 开放问题
- 
`,
  ops: `# {name}

## 目标
这条线要达到什么结果？

## 渠道与形式
- 渠道：
- 内容形式：

## 节奏
| 时间 | 动作 | 负责 |
|---|---|---|
|  |  |  |

## 关键指标
- 

## 待确认
- 
`,
};

const pad = (n: number) => String(n).padStart(2, '0');
export const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const addDays = (s: string, n: number) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const fmtDue = (s: string | null | undefined) => {
  if (!s) return '';
  const t = todayStr();
  if (s === t) return '今天';
  if (s === addDays(t, 1)) return '明天';
  if (s === addDays(t, -1)) return '昨天';
  const [y, m, d] = s.split('-');
  return (y === t.slice(0, 4) ? '' : y + '/') + Number(m) + '/' + Number(d);
};
export const dueClass = (s: string | null | undefined) => { if (!s) return ''; const t = todayStr(); return s < t ? 'over' : s === t ? 'today' : ''; };
export const fmtTime = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const curStage = (p: Project): Stage | undefined => (p.stages || []).find(s => !s.done);
export const nextUndoneIdx = (p: Project) => (p.stages || []).findIndex(s => !s.done);
export const defaultStages = (type: ProjectType): Stage[] => STAGE_TPL[type].map(name => ({ name, due: '', done: false }));

export const CHANNELS: [string, string][] = [['SEO', 'SEO'], ['SEM', 'SEM'], ['XHS', '小红书'], ['SOCIAL', '社媒'], ['WEB', '建站'], ['BRAND_AU', '品牌出海'], ['LOCAL', '本地服务']];
export const CHANNEL_LABEL = (k: string) => CHANNELS.find(c => c[0] === k)?.[1] || k;
export const STAGES_CLIENT: [string, string][] = [['active', '在营'], ['lead', '线索'], ['paused', '暂停'], ['churned', '流失']];
export const STAGE_LABEL = (k: string) => STAGES_CLIENT.find(c => c[0] === k)?.[1] || k;
export const LINK_PRESETS = ['官网', 'Google Analytics', 'Search Console', 'Google Ads', 'Semrush', '小红书', '飞书/Drive 文件夹'];
export const lastLogDate = (log: string): string | null => { const m = log.match(/^## (\d{4}-\d{2}-\d{2})/m); return m ? m[1] : null; };
export const appendLog = (log: string, text: string): string => {
  const t = todayStr(); const head = `## ${t}`;
  if (log.startsWith(head)) { const i = log.indexOf('\n'); const rest = i < 0 ? '' : log.slice(i); return `${head}\n- ${text}${rest}`; }
  return `${head}\n- ${text}\n\n${log}`.trimEnd() + '\n';
};

/* Todoist 式快速添加解析：「明天 给客户发周报 !」「周五 #SE Lab 写 PRD」「@Made by Cow 看 SEM」 */
export function parseQuick(raw: string, projects: { id: string; name: string }[], clients: { id: string; name: string }[]) {
  let text = ' ' + raw.trim() + ' ';
  let due: string | null = todayStr(); let priority: 'normal' | 'high' = 'normal';
  let project_id: string | null = null; let client_id: string | null = null;
  const t = todayStr(); const dow = new Date(t + 'T00:00:00').getDay();
  const rel: [RegExp, () => string | null][] = [
    [/\s(今天|今日)\s/, () => t], [/\s明天\s/, () => addDays(t, 1)], [/\s后天\s/, () => addDays(t, 2)],
    [/\s(下周|下星期)\s/, () => addDays(t, ((8 - dow) % 7) || 7)],
    [/\s(无日期|不限|待定)\s/, () => null],
  ];
  for (const [re, f] of rel) { if (re.test(text)) { due = f(); text = text.replace(re, ' '); break; } }
  const wd = text.match(/\s(下?)(周|星期)([一二三四五六日天])\s/);
  if (wd) { const n = '日一二三四五六'.indexOf(wd[3] === '天' ? '日' : wd[3]); let diff = (n - dow + 7) % 7; if (diff === 0) diff = 7; if (wd[1]) diff += 7; due = addDays(t, diff); text = text.replace(wd[0], ' '); }
  const md = text.match(/\s(\d{1,2})[\/月](\d{1,2})日?\s/);
  if (md) { const y = t.slice(0, 4); due = `${y}-${md[1].padStart(2, '0')}-${md[2].padStart(2, '0')}`; text = text.replace(md[0], ' '); }
  if (/[!！]/.test(text)) { priority = 'high'; text = text.replace(/[!！]+/g, ' '); }
  const pick = (prefix: string, list: { id: string; name: string }[]) => {
    const m = text.match(new RegExp(`\\s${prefix}([^\\s#@]+)`)); if (!m) return null;
    const q = m[1].toLowerCase(); const hit = list.find(x => x.name.toLowerCase().startsWith(q)) || list.find(x => x.name.toLowerCase().includes(q));
    if (hit) text = text.replace(m[0], ' '); return hit?.id || null;
  };
  project_id = pick('#', projects); client_id = pick('@', clients);
  return { title: text.replace(/\s+/g, ' ').trim(), due, priority, project_id, client_id };
}
