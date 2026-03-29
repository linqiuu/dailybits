# DailyBits

DailyBits 是一个面向碎片化学习场景的知识推送平台，支持题库管理、AI 题目生成、多时段订阅推送与学习统计看板。

## 项目目标

将「内容沉淀 + 间隔复习 + 自动推送」整合为轻量、可扩展、可二次开发的学习系统。

## 核心能力

- 题库管理：创建、编辑、删除与发布题目，支持可见性控制（私有 / 公开 / 部门可见）
- 多源录入：手动输入、JSON 批量导入、文本生成、文件导入、URL 解析
- AI 抽象层：通过环境变量切换模型服务，生成后支持预览再发布
- 定时推送：支持一个订阅配置多个推送时间点，推送完成自动结束或循环推送
- 智能选题：优先未推送题目，推送完支持自动结束订阅或循环 N 次
- 数据看板：订阅、推送与学习统计
- 评论系统：题库评论与回复、点赞，支持最新 / 最热排序
- 群组订阅：支持群组看板和订阅管理，标识操作人身份
- 批量操作：批量删除题目、复制题目 JSON、JSON 批量导入

## 技术栈

- Next.js (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- NextAuth（GitHub OAuth + 可选自定义 OAuth）
- Prisma + PostgreSQL
- node-cron（独立调度进程）
- OpenAI / 兼容模型服务

## 系统架构

采用「单 Next.js 应用 + 独立 Scheduler 进程」模式：

- Web 层：页面与 API 路由
- 业务层：`src/lib` 沉淀核心逻辑
- 调度层：`src/scheduler/index.ts` 每分钟扫描订阅并触发推送
- 数据层：应用与调度器共享同一数据库

## 目录结构

```text
learn/
├── docs/plans/               # 设计与实现文档
├── prisma/                   # Prisma schema 与迁移
├── src/
│   ├── app/                  # 页面与 API
│   │   ├── api/
│   │   │   ├── banks/        # 题库 CRUD + 可见性过滤
│   │   │   ├── comments/     # 评论删除与点赞
│   │   │   ├── departments/  # 部门查询（打桩 / 代理）
│   │   │   ├── subscriptions/ # 订阅管理（含结束条件）
│   │   │   └── ...
│   │   ├── bank/             # 题库页面（详情、编辑、创建）
│   │   └── group/            # 群组看板页面
│   ├── components/           # 业务组件与 UI 组件
│   │   ├── bank/             # 题库卡片、评论区、订阅面板
│   │   ├── question/         # 题目列表（批量删除、复制 JSON）
│   │   └── group/            # 群组看板组件
│   ├── lib/                  # 认证、推送、LLM、解析等核心逻辑
│   ├── middleware.ts          # 默认登录重定向
│   └── scheduler/            # 定时调度入口（含结束条件逻辑）
├── .env.example
├── LICENSE
└── package.json
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

关键变量：

```bash
DATABASE_URL=""
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET=""
GITHUB_ID=""
GITHUB_SECRET=""
CUSTOM_OAUTH_CLIENT_ID=""
CUSTOM_OAUTH_CLIENT_SECRET=""
CUSTOM_OAUTH_AUTH_URL=""
CUSTOM_OAUTH_TOKEN_URL=""
CUSTOM_OAUTH_USERINFO_URL=""
CUSTOM_OAUTH_SCOPE=""
LLM_PROVIDER="openai"
LLM_API_KEY=""
LLM_API_BASE_URL=""
LLM_MODEL="gpt-4o-mini"
PUSH_API_URL=""
JINA_API_KEY=""
GROUP_CHAT_ID=""              # 首页展示交流群号（选填）
DEPARTMENT_API_URL=""         # 部门查询接口（选填，未配置则使用打桩数据）
SCHEDULER_TIMEZONE="Asia/Shanghai"
HOLIDAY_COUNTRY="CN"
SKIP_NON_WORKING_DAYS="true"
```

### 3. 启动服务

```bash
npm run dev
```

访问地址：`http://localhost:3000`

### 4. 启动调度器（可选）

```bash
npm run scheduler
```

## Docker 部署

项目已提供容器化配置，可一键启动 `Web + Scheduler + PostgreSQL`。

### 1. 准备环境变量

```bash
cp .env.example .env
```

至少补齐以下变量（推荐）：

- `NEXTAUTH_SECRET`
- `GITHUB_ID` / `GITHUB_SECRET`（如果使用 GitHub 登录）
- `LLM_API_KEY`（如果使用 AI 生成能力）
- `PUSH_API_URL`（如果接入推送服务）

> `docker-compose.yml` 会将 `DATABASE_URL` 覆盖为容器内数据库地址：`postgresql://postgres:postgres@db:5432/dailybits?schema=public`。

### 2. 构建并启动

```bash
docker compose up --build -d
```

默认服务：

- `app`：Next.js Web 服务（`http://localhost:3000`）
- `scheduler`：定时推送调度进程
- `db`：PostgreSQL 16

### 3. 查看日志

```bash
docker compose logs -f app
docker compose logs -f scheduler
```

### 4. 停止服务

```bash
docker compose down
```

如需连同数据库数据卷一起删除：

```bash
docker compose down -v
```

## 常用脚本

- `npm run dev`：开发模式
- `npm run build`：生产构建
- `npm run start`：生产启动
- `npm run lint`：代码检查
- `npm run scheduler`：运行定时调度

## 项目文档

- 设计文档：`docs/plans/2026-03-15-knowledge-push-design.md`
- 实现计划：`docs/plans/2026-03-15-knowledge-push-implementation.md`
- 订阅解耦与群组重构：`docs/plans/2026-03-18-subscription-decoupling.md`
- v2 功能增强：`docs/plans/2026-03-29-v2-enhancements.md`

## 许可证

本项目基于 [MIT License](./LICENSE) 开源。
