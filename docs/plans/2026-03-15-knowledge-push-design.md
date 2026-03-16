# 知识推送系统 — 设计文档

> 日期：2026-03-15
> 状态：已批准

> 2026-03-16 变更补充：接入可选自定义 OAuth（用户主 id 与 uid 字段均可通过环境变量映射），推送 `receiver` 改为 `uid`（缺省回退 `userId`），推送载荷新增题库 `title` 字段。

## 1. 产品定位

支持 AI 自动化解析、多时段精准投喂的 **碎片化知识刷题平台**。

- MVP 范围：题库录入 + 智能推送 + 数据看板
- 播客功能：远期规划，MVP 不实现
- 用户模型：所有用户平等，任何人可建库可订阅

## 2. 技术栈

| 层级 | 技术 |
|---|---|
| 前端框架 | Next.js 15 (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| ORM | Prisma |
| 数据库 | Supabase PostgreSQL |
| 认证 | NextAuth (GitHub OAuth，内网可替换为内部 SSO) |
| 定时调度 | node-cron（独立 Node.js 进程） |
| LLM | 抽象层 + 环境变量配置（OpenAI / DeepSeek / 其他） |
| URL 解析 | Jina Reader API |

## 3. 架构方案

**方案 A：单项目 + 协同调度进程**

单一 Next.js 项目，调度器作为独立进程共享同一份代码和 Prisma Client。

```
用户浏览器 → Next.js App Router (页面 + API Routes)
                    ↓
              lib/ (共享业务逻辑)
                    ↓
              Prisma Client → Supabase PostgreSQL
                    ↑
              scheduler/ (node-cron 独立进程)
                    ↓
              推送目标 (POST → Mock / 飞书 / 内网 IM)
```

## 4. 项目结构

```
learn/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx               # 发现页
│   │   ├── (auth)/login/page.tsx
│   │   ├── bank/
│   │   │   ├── new/page.tsx       # 创建题库
│   │   │   └── [id]/
│   │   │       ├── page.tsx       # 题库详情
│   │   │       └── edit/page.tsx  # 编辑/审核
│   │   ├── dashboard/page.tsx     # 个人中心
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── banks/
│   │       ├── questions/
│   │       ├── subscriptions/
│   │       └── push/trigger/route.ts
│   ├── components/
│   │   ├── ui/                    # shadcn/ui
│   │   ├── layout/
│   │   ├── bank/
│   │   ├── question/
│   │   └── dashboard/
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── auth.ts
│   │   ├── llm/
│   │   │   ├── provider.ts        # LLM 抽象接口
│   │   │   ├── openai.ts
│   │   │   ├── deepseek.ts
│   │   │   └── prompts.ts
│   │   ├── push/
│   │   │   ├── adapter.ts         # 推送适配器
│   │   │   ├── selector.ts        # 选题算法
│   │   │   └── payload.ts
│   │   ├── parser/
│   │   │   ├── excel.ts
│   │   │   ├── document.ts
│   │   │   └── jina.ts
│   │   └── utils.ts
│   ├── scheduler/
│   │   └── index.ts               # node-cron 入口
│   └── types/index.ts
├── public/
├── docs/plans/
├── .env / .env.example
├── package.json
├── tailwind.config.ts
└── next.config.ts
```

## 5. 数据模型 (Prisma Schema)

### NextAuth 认证表

- `Account`, `Session`, `VerificationToken` — NextAuth 标准表

### 业务表

#### User

| 字段 | 类型 | 说明 |
|---|---|---|
| id | cuid | 主键 |
| email | String? | 唯一 |
| name | String? | |
| image | String? | |
| emailVerified | DateTime? | |

关联：banks (创建的题库), subscriptions, pushLogs

#### QuestionBank

| 字段 | 类型 | 说明 |
|---|---|---|
| id | cuid | 主键 |
| title | String | 题库名 |
| description | String? | 描述 |
| creatorId | String | 创建者 |
| subscriberCount | Int (默认 0) | 冗余热度字段 |
| createdAt | DateTime | |
| updatedAt | DateTime | |

#### Question

| 字段 | 类型 | 说明 |
|---|---|---|
| id | cuid | 主键 |
| bankId | String | 所属题库 |
| content | String | 题干 |
| options | Json | `["A. ...", "B. ...", "C. ...", "D. ..."]` |
| correctAnswer | String | `"A"` / `"B"` / `"C"` / `"D"` |
| explanation | String | 解析 |
| status | QuestionStatus | `DRAFT` / `PUBLISHED` |
| source | QuestionSource | `MANUAL` / `EXCEL_IMPORT` / `AI_GENERATED` |
| createdAt | DateTime | |
| updatedAt | DateTime | |

#### Subscription

| 字段 | 类型 | 说明 |
|---|---|---|
| id | cuid | 主键 |
| userId | String | |
| bankId | String | |
| pushTimes | String[] | `["09:30", "11:30", "14:30"]` |
| isActive | Boolean (默认 true) | |
| createdAt | DateTime | |

唯一约束：`[userId, bankId]`

#### PushLog

| 字段 | 类型 | 说明 |
|---|---|---|
| id | cuid | 主键 |
| userId | String | |
| questionId | String | |
| pushedAt | DateTime | |

索引：`[userId, questionId]`, `[userId]`

## 6. API 设计

### 认证
- `GET/POST /api/auth/[...nextauth]` — NextAuth

### 题库 CRUD
- `GET /api/banks` — 题库列表（分页/搜索）
- `POST /api/banks` — 创建题库
- `GET /api/banks/[id]` — 题库详情
- `PATCH /api/banks/[id]` — 更新题库
- `DELETE /api/banks/[id]` — 删除题库

### 题目
- `GET /api/banks/[id]/questions` — 题目列表
- `POST /api/banks/[id]/questions` — 手动添加
- `PATCH /api/questions/[id]` — 编辑题目
- `DELETE /api/questions/[id]` — 删除题目
- `POST /api/banks/[id]/questions/publish` — 批量发布

### AI 生成
- `POST /api/banks/[id]/generate/text` — 文本生成
- `POST /api/banks/[id]/generate/file` — 文件导入/生成
- `POST /api/banks/[id]/generate/url` — URL 解析生成

### 订阅
- `POST /api/subscriptions` — 订阅
- `DELETE /api/subscriptions/[id]` — 取消
- `PATCH /api/subscriptions/[id]` — 修改推送时间
- `GET /api/subscriptions/mine` — 我的订阅

### 推送
- `POST /api/push/trigger` — 手动触发（调试）
- `GET /api/push/logs` — 推送记录

### 看板
- `GET /api/dashboard/stats` — 统计数据

## 7. 核心业务逻辑

### 7.1 选题算法

1. **优先推送最新未推过的题**：查 Question 表中该用户未出现在 PushLog 中的题目，按 createdAt DESC 取第一条
2. **兜底随机复习**：全部推过则随机抽一条

### 7.2 推送适配器

```typescript
interface PushPayload {
  receiver: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}
```

- `PUSH_API_URL` 存在 → POST 到该 URL
- `PUSH_API_URL` 为空 → console.log 打桩

### 7.3 调度器

- node-cron 每分钟执行
- 取当前 HH:mm，匹配 Subscription.pushTimes
- 对每个匹配的订阅执行选题 → 推送 → 记录 PushLog
- 通过检查当日 PushLog 实现幂等

### 7.4 LLM 抽象层

- 工厂函数根据 `LLM_PROVIDER` 环境变量选择实现
- 统一接口 `generateQuestions(text, count)`
- 长文档按 2000 字切片，分批生成后合并

### 7.5 文件/URL 解析

- Excel/CSV：按固定列头直接映射
- 纯文本：LLM 提取知识点 + 生成题目
- Word/PDF：提取文本 → 切片 → LLM 生成
- URL：Jina Reader 转 Markdown → 切片 → LLM 生成

## 8. UI/UX 设计 — 文艺书卷风

### 8.1 美学方向

旧书店 · 手写笔记 · 纸张质感 · 文人书房

### 8.2 色彩系统

| 变量 | 值 | 用途 |
|---|---|---|
| --bg-primary | #F5F2EC | 页面底色（纸案米灰） |
| --bg-secondary | #FFFFFF | 卡片底色（宣纸白） |
| --bg-accent | #ECE5DB | 弱强调背景 |
| --text-primary | #2C3036 | 焦墨正文 |
| --text-secondary | #5C646F | 次级说明 |
| --text-muted | #8A8175 | 提示/禁用 |
| --accent | #8A3B33 | 朱砂主色（主按钮/关键状态） |
| --accent-hover | #7A2F28 | 主色 hover |
| --accent-subtle | #EAD8D2 | 朱砂浅底 |
| --accent-secondary | #2F4B66 | 石青辅助色（标签/序号） |
| --border | #DCCFC0 | 边线 |
| --success | #526E3F | 正确/成功 |
| --error | #A0483D | 错误/警告 |

### 8.3 字体

- 标题：`"Noto Serif SC", "Playfair Display", serif`
- 正文：`"LXGW WenKai", "Source Han Sans SC", sans-serif`
- 代码：`"JetBrains Mono", monospace`

### 8.4 组件语言

- 卡片：圆角 8px，浅边框 + 大范围柔和投影，hover 微上浮（纸张悬浮感）
- 按钮：克制设计，主按钮 accent 色，次按钮描边，无渐变
- 输入框：浅底色容器 + 微圆角 + 图标前缀，focus 强化 ring
- 分隔：虚线或极淡实线
- 动画：淡入 + translateY(8px)，300ms

### 8.5 页面

1. **发现页**（首页）— 题库卡片双列网格 + 搜索 + 创建按钮
2. **题库详情页** — 题库信息 + 订阅设置 + 题目列表
3. **创建题库** — 基本信息 + Tab 切换录入方式（手动/文本/文件/URL）
4. **草稿审核** — 逐题审核编辑 + 进度条 + 批量发布
5. **个人中心** — 统计卡片 + 订阅列表 + 推送记录

### 8.6 响应式

- ≥ 960px：双列
- 640-960px：双列压缩
- < 640px：单列 + 汉堡菜单

## 9. 环境变量

```bash
# 数据库
DATABASE_URL="postgresql://..."

# 认证
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="dev_secret"
GITHUB_ID=""
GITHUB_SECRET=""

# LLM
LLM_PROVIDER="openai"
LLM_API_KEY=""
LLM_API_BASE_URL=""
LLM_MODEL="gpt-4o-mini"

# 推送
PUSH_API_URL=""

# Jina Reader
JINA_API_KEY=""
```
