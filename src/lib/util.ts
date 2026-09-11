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
