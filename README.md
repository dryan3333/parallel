# 平行线

产品线与运营线并行的项目管理台。两人协作，按项目分配权限，PRD、阶段计划、看板、提醒。
网页做成 PWA：Windows / Mac 用 Chrome 或 Edge「安装应用」，iPhone / Android「添加到主屏幕」。

## 技术栈

- 前端：React + Vite + TypeScript，`vite-plugin-pwa` 生成离线缓存和安装清单
- 后端：Supabase（登录、Postgres、行级安全、实时同步），免费版够两人用
- 部署：GitHub Actions 自动构建到 GitHub Pages

## 第一次部署（约 15 分钟）

### 1. Supabase

1. 到 https://supabase.com 用 GitHub 账号登录，New project，区域选 Sydney。
2. 左侧 SQL Editor，新建 query，把 `supabase/schema.sql` 整个贴进去，Run。
3. 左侧 Authentication → Providers → Email：保持 Email 打开。想跳过邮箱验证就把 **Confirm email** 关掉（两个人用没必要验证）。
4. 左侧 Project Settings → API，记下 **Project URL** 和 **anon public** key。

### 2. GitHub

1. 在 GitHub 新建一个仓库，比如 `parallel`，私有公开都行。
2. 本地推送：

```bash
git remote add origin https://github.com/<你的用户名>/parallel.git
git push -u origin main
```

3. 仓库 Settings → Secrets and variables → Actions → New repository secret，加两个：
   - `VITE_SUPABASE_URL` = 第 1 步的 Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon public key
4. 仓库 Settings → Pages → Source 选 **GitHub Actions**。
5. Actions 页看到 Deploy 跑完，地址是 `https://<你的用户名>.github.io/parallel/`。

### 3. 第一次使用

1. 打开地址，**你先注册**。第一个注册且没有被邀请的账号自动成为工作区最高权限（owner）。
2. 「成员」页输入她的邮箱点邀请，然后她用这个邮箱注册，登录后自动进入你的工作区。
3. 「成员」页右侧的权限矩阵，勾选她能编辑的项目。没勾的她只能看。
4. 「提醒」页可以互相发提醒；打开系统通知后，应用开着时会弹窗。

## 本地开发

```bash
cp .env.example .env   # 填入 Supabase URL 和 anon key
npm install
npm run dev
```

## 权限模型

| 角色 | 能做什么 |
|---|---|
| owner（最高权限） | 一切：建/删/归档项目，邀请和移除成员，分配项目权限 |
| member 被分配到某项目 | 修改该项目的 PRD、阶段、任务 |
| member 未分配 | 只读；可以创建不关联项目的个人任务；可以给任何人发提醒 |
| 任务负责人 | 无论项目权限如何，都能改自己被指派的任务状态 |

权限在数据库行级安全策略里强制执行，见 `supabase/schema.sql`，不是只在界面上隐藏按钮。

## 还没做的

- 应用关闭时的推送提醒（需要 Supabase Edge Function + Web Push，第二阶段）
- Forest / Flora 式的花园视觉（第二阶段）
- 桌面和手机小组件（需要原生壳，第三阶段）
