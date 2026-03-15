# DailyBits

一个面向碎片化学习场景的知识推送平台：支持题库创建、AI 题目生成、多时段订阅推送和学习数据看板。  
项目目标是把「内容沉淀 + 间隔复习 + 自动推送」整合到一个轻量、可扩展的系统里。

## 功能概览

- 题库管理：创建、编辑、删除、发布题目
- 多种题目来源：手动录入、文本生成、文件导入、URL 解析
- AI 生成链路：抽象 LLM Provider，可按环境变量切换模型服务
- 订阅推送：用户可为题库配置多个推送时间点
- 智能选题：优先推送未刷题目，兜底随机复习
- 数据看板：展示订阅、推送与学习统计

## 技术栈

- 前端：Next.js (App Router) + TypeScript
- UI：Tailwind CSS + shadcn/ui
- 认证：NextAuth (GitHub OAuth)
- 数据库：Supabase PostgreSQL
- ORM：Prisma
- 调度：node-cron (独立 scheduler 进程)
- AI：可切换 Provider（OpenAI / DeepSeek / 其他兼容服务）
- 内容解析：Jina Reader API + 文档/表格解析

## 架构说明

采用「单 Next.js 项目 + 独立调度进程」方案：

- Web 层负责页面渲染与 API 路由
- 业务能力沉淀在 `src/lib`
- 调度器在 `src/scheduler/index.ts` 按分钟扫描订阅并触发推送
- 应用与调度器共享 Prisma Client 和同一数据库

## 目录结构

```text
learn/
├── docs/plans/               # 设计与实现文档
├── prisma/                   # Prisma schema
├── src/
│   ├── app/                  # Next.js App Router 页面与 API
│   ├── components/           # 业务组件 + UI 组件
│   ├── lib/                  # 认证、LLM、推送、解析等核心逻辑
│   └── scheduler/            # node-cron 调度入口
├── .env.example
└── package.json
```

## 快速开始

### 1) 安装依赖

```bash
npm install
```

### 2) 配置环境变量

复制模板并填写配置：

```bash
cp .env.example .env
```

关键变量示例：

```bash
DATABASE_URL=""
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET=""
GITHUB_ID=""
GITHUB_SECRET=""
LLM_PROVIDER="openai"
LLM_API_KEY=""
LLM_API_BASE_URL=""
LLM_MODEL="gpt-4o-mini"
PUSH_API_URL=""
JINA_API_KEY=""
```

### 3) 启动开发服务

```bash
npm run dev
```

默认访问：`http://localhost:3000`

### 4) 启动推送调度器（可选）

```bash
npm run scheduler
```

## 常用脚本

- `npm run dev`：启动开发环境
- `npm run build`：构建生产包
- `npm run start`：启动生产服务
- `npm run lint`：运行 ESLint
- `npm run scheduler`：启动定时推送进程

## 文档

- 设计文档：`docs/plans/2026-03-15-knowledge-push-design.md`
- 实现计划：`docs/plans/2026-03-15-knowledge-push-implementation.md`

## Roadmap

- [x] MVP 设计与实现规划
- [ ] 题库与题目核心流程完善
- [ ] 推送链路稳定性与幂等性增强
- [ ] 看板统计和复习策略优化
- [ ] 播客学习场景（远期）

## 开源说明

当前仓库用于产品开发与验证，欢迎提 Issue/PR 参与改进。  
如需对外发布，建议补充明确 License（如 MIT）与贡献规范（`CONTRIBUTING.md`）。
