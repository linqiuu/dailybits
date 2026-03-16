# DailyBits

DailyBits 是一个面向碎片化学习场景的知识推送平台，支持题库管理、AI 题目生成、多时段订阅推送与学习统计看板。

## 项目目标

将「内容沉淀 + 间隔复习 + 自动推送」整合为轻量、可扩展、可二次开发的学习系统。

## 核心能力

- 题库管理：创建、编辑、删除与发布题目
- 多源录入：手动输入、文本生成、文件导入、URL 解析
- AI 抽象层：通过环境变量切换模型服务
- 定时推送：支持一个订阅配置多个推送时间点
- 智能选题：优先未推送题目，兜底随机复习
- 数据看板：订阅、推送与学习统计

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
│   ├── components/           # 业务组件与 UI 组件
│   ├── lib/                  # 认证、推送、LLM、解析等核心逻辑
│   └── scheduler/            # 定时调度入口
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

## 常用脚本

- `npm run dev`：开发模式
- `npm run build`：生产构建
- `npm run start`：生产启动
- `npm run lint`：代码检查
- `npm run scheduler`：运行定时调度

## 项目文档

- 设计文档：`docs/plans/2026-03-15-knowledge-push-design.md`
- 实现计划：`docs/plans/2026-03-15-knowledge-push-implementation.md`

## 许可证

本项目基于 [MIT License](./LICENSE) 开源。
