# 知识推送系统 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 构建一个支持 AI 自动化解析、多时段精准推送的碎片化知识刷题平台（MVP）。

**Architecture:** 单 Next.js 项目 + 独立 node-cron 调度进程。Next.js App Router 处理页面和 API，lib/ 目录封装共享业务逻辑（选题算法、推送适配器、LLM 抽象层），scheduler/ 作为独立进程复用同一份代码。推送通过可配置 URL 的 POST 请求触达 IM 工具。

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Prisma, NextAuth, node-cron, Jina Reader API

**Design Doc:** `docs/plans/2026-03-15-knowledge-push-design.md`

---

## 变更同步（2026-03-16）

- 认证：`src/lib/auth.ts` 新增可选 `custom-oauth` Provider；`id/uid/name/email` 的映射集中在 `mapCustomOAuthProfile()`，可在内网按实际返回结构替换。
- 环境变量：`.env.example` 新增 `CUSTOM_OAUTH_*` 配置，用于授权地址、token/userinfo 地址和 profile 字段映射。
- 数据库：`User` 模型新增 `uid String? @unique`，并新增迁移 `20260316103000_add_user_uid`。
- 推送目标：`receiver` 从 `userId` 调整为 `User.uid`（缺省回退 `userId`），`PushPayload` 新增 `title`（题库名称）。

---

## Task 1: 项目脚手架搭建

**Files:**
- Create: `package.json` (via create-next-app)
- Create: `tailwind.config.ts`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `.gitignore`

**Step 1: 初始化 Next.js 项目**

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm
```

注意：项目目录是 `d:\projects\ai_project_test\learn`，已有 `docs/` 目录，create-next-app 应在此目录运行。选择 "Yes" for all defaults。

**Step 2: 安装核心依赖**

```bash
pnpm add prisma @prisma/client next-auth @auth/prisma-adapter
pnpm add node-cron
pnpm add xlsx csv-parse
pnpm add openai
pnpm add -D @types/node-cron tsx
```

**Step 3: 安装 shadcn/ui**

```bash
pnpm dlx shadcn@latest init
```

选择：
- Style: Default
- Base color: Neutral (我们会覆盖为书卷风色彩)
- CSS variables: Yes

然后安装常用组件：

```bash
pnpm dlx shadcn@latest add button card input label textarea select dialog tabs badge separator dropdown-menu avatar toast sheet
```

**Step 4: 创建 .env.example**

```bash
# 创建 .env.example 文件，内容如下：
```

```env
# === 数据库 ===
DATABASE_URL="postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres"

# === 认证 ===
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="dev_secret_key_change_in_production"
GITHUB_ID=""
GITHUB_SECRET=""

# === LLM ===
LLM_PROVIDER="openai"
LLM_API_KEY=""
LLM_API_BASE_URL=""
LLM_MODEL="gpt-4o-mini"

# === 推送 ===
PUSH_API_URL=""

# === Jina Reader ===
JINA_API_KEY=""
```

复制为 `.env` 并填入实际值。

**Step 5: 更新 .gitignore**

确保 `.gitignore` 包含：
```
.env
.env.local
node_modules/
.next/
```

**Step 6: Commit**

```bash
git init
git add .
git commit -m "chore: initialize Next.js project with core dependencies"
```

---

## Task 2: Prisma Schema + 数据库迁移

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/prisma.ts`

**Step 1: 初始化 Prisma**

```bash
pnpm prisma init
```

**Step 2: 编写完整 Schema**

编辑 `prisma/schema.prisma`：

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

model User {
  id            String         @id @default(cuid())
  email         String?        @unique
  name          String?
  image         String?
  emailVerified DateTime?
  accounts      Account[]
  sessions      Session[]
  banks         QuestionBank[]
  subscriptions Subscription[]
  pushLogs      PushLog[]
}

model QuestionBank {
  id              String         @id @default(cuid())
  title           String
  description     String?
  creatorId       String
  subscriberCount Int            @default(0)
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  creator         User           @relation(fields: [creatorId], references: [id])
  questions       Question[]
  subscriptions   Subscription[]
}

enum QuestionStatus {
  DRAFT
  PUBLISHED
}

enum QuestionSource {
  MANUAL
  EXCEL_IMPORT
  AI_GENERATED
}

model Question {
  id            String         @id @default(cuid())
  bankId        String
  content       String
  options       Json
  correctAnswer String
  explanation   String
  status        QuestionStatus @default(DRAFT)
  source        QuestionSource @default(MANUAL)
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  bank          QuestionBank   @relation(fields: [bankId], references: [id], onDelete: Cascade)
  pushLogs      PushLog[]
}

model Subscription {
  id        String       @id @default(cuid())
  userId    String
  bankId    String
  pushTimes String[]
  isActive  Boolean      @default(true)
  createdAt DateTime     @default(now())
  user      User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  bank      QuestionBank @relation(fields: [bankId], references: [id], onDelete: Cascade)

  @@unique([userId, bankId])
}

model PushLog {
  id         String   @id @default(cuid())
  userId     String
  questionId String
  pushedAt   DateTime @default(now())
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  question   Question @relation(fields: [questionId], references: [id], onDelete: Cascade)

  @@index([userId, questionId])
  @@index([userId])
}
```

**Step 3: 创建 Prisma Client 单例**

创建 `src/lib/prisma.ts`：

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

**Step 4: 运行迁移**

```bash
pnpm prisma migrate dev --name init
```

Expected: 迁移成功，数据库表创建完成。

**Step 5: 生成 Prisma Client**

```bash
pnpm prisma generate
```

**Step 6: Commit**

```bash
git add .
git commit -m "feat: add Prisma schema with all business models and run initial migration"
```

---

## Task 3: NextAuth 认证配置

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/types/index.ts`

**Step 1: 创建 NextAuth 配置**

创建 `src/lib/auth.ts`：

```typescript
import { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
  },
  pages: {
    signIn: "/login",
  },
};
```

**Step 2: 创建 API Route**

创建 `src/app/api/auth/[...nextauth]/route.ts`：

```typescript
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

**Step 3: 创建类型扩展**

创建 `src/types/index.ts`：

```typescript
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

export interface GeneratedQuestion {
  content: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export interface PushPayload {
  receiver: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}
```

**Step 4: 验证应用启动**

```bash
pnpm dev
```

Expected: 应用在 `http://localhost:3000` 启动，无报错。

**Step 5: Commit**

```bash
git add .
git commit -m "feat: configure NextAuth with GitHub OAuth and JWT session"
```

---

## Task 4: 全局布局 + 文艺书卷风主题

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Create: `src/components/layout/header.tsx`
- Create: `src/components/layout/footer.tsx`
- Create: `src/app/(auth)/login/page.tsx`

**Step 1: 设置全局 CSS 变量和字体**

编辑 `src/app/globals.css`，替换全部内容：

```css
@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=Playfair+Display:wght@400;600;700&family=LXGW+WenKai:wght@300;400;700&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --bg-primary: #F5F2EC;
    --bg-secondary: #FFFFFF;
    --bg-accent: #ECE5DB;
    --text-primary: #2C3036;
    --text-secondary: #5C646F;
    --text-muted: #8A8175;
    --accent: #8A3B33;      /* 朱砂主色 */
    --accent-hover: #7A2F28;
    --accent-subtle: #EAD8D2;
    --accent-secondary: #2F4B66; /* 石青辅助色 */
    --border: #DCCFC0;
    --shadow: rgba(44, 48, 54, 0.08);
    --success: #5B7A3A;
    --error: #A0522D;

    --font-display: "Noto Serif SC", "Playfair Display", serif;
    --font-body: "LXGW WenKai", "Source Han Sans SC", sans-serif;
    --font-mono: "JetBrains Mono", "Fira Code", monospace;

    --background: var(--bg-primary);
    --foreground: var(--text-primary);
    --card: var(--bg-secondary);
    --card-foreground: var(--text-primary);
    --primary: var(--accent);
    --primary-foreground: #FFFFFF;
    --secondary: var(--bg-accent);
    --secondary-foreground: var(--text-primary);
    --muted: var(--bg-accent);
    --muted-foreground: var(--text-muted);
    --border: var(--border);
    --input: var(--border);
    --ring: var(--accent);
    --radius: 0.5rem;
  }

  body {
    font-family: var(--font-body);
    background-color: var(--bg-primary);
    color: var(--text-primary);
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-display);
  }
}

@layer components {
  .page-enter {
    animation: pageEnter 300ms ease-out;
  }

  @keyframes pageEnter {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .card-hover {
    transition: box-shadow 200ms ease, transform 200ms ease;
  }
  .card-hover:hover {
    box-shadow: 0 4px 20px rgba(139, 105, 20, 0.1);
    transform: translateY(-1px);
  }

  .divider-literary {
    display: flex;
    align-items: center;
    gap: 1rem;
    color: var(--text-muted);
    font-family: var(--font-display);
  }
  .divider-literary::before,
  .divider-literary::after {
    content: "";
    flex: 1;
    border-top: 1px dashed var(--border);
  }
}
```

**Step 2: 创建 Header 组件**

创建 `src/components/layout/header.tsx`：

使用衬线体 Logo "知识推送"，右侧「发现」「我的」链接 + 用户头像/登录按钮。
导航栏背景透明，底部 1px border。

**Step 3: 创建 Footer 组件**

创建 `src/components/layout/footer.tsx`：

简约版权行，衬线体小字居中。

**Step 4: 编辑根布局**

修改 `src/app/layout.tsx`：

引入 SessionProvider、Header、Footer，设置 `<html lang="zh-CN">`。
主内容区 `max-w-[960px] mx-auto px-4`。

**Step 5: 创建登录页**

创建 `src/app/(auth)/login/page.tsx`：

居中卡片，显示 "欢迎回到书房" 标题（衬线体），GitHub 登录按钮。

**Step 6: 验证主题效果**

```bash
pnpm dev
```

Expected: 访问首页看到书卷风配色、衬线体标题、暖色调背景。

**Step 7: Commit**

```bash
git add .
git commit -m "feat: implement literary bookish theme with global layout, header, footer, and login page"
```

---

## Task 5: 题库 CRUD (API + UI)

**Files:**
- Create: `src/app/api/banks/route.ts` (GET list, POST create)
- Create: `src/app/api/banks/[id]/route.ts` (GET detail, PATCH update, DELETE)
- Create: `src/app/page.tsx` (发现页 - 题库列表)
- Create: `src/app/bank/new/page.tsx` (创建题库表单)
- Create: `src/app/bank/[id]/page.tsx` (题库详情页)
- Create: `src/components/bank/bank-card.tsx`

**Step 1: 题库 API - 列表 + 创建**

创建 `src/app/api/banks/route.ts`：

- `GET`：查询所有题库，包含 creator 信息和 question count，支持 `?search=` 和 `?page=` 参数
- `POST`：创建题库，需要认证，参数 `{ title, description }`

**Step 2: 题库 API - 详情/更新/删除**

创建 `src/app/api/banks/[id]/route.ts`：

- `GET`：获取题库详情 + 题目列表 + 当前用户订阅状态
- `PATCH`：更新题库信息（仅创建者）
- `DELETE`：删除题库（仅创建者，级联删除题目）

**Step 3: 题库卡片组件**

创建 `src/components/bank/bank-card.tsx`：

展示题库名、创建者、题数、订阅人数、订阅按钮。卡片使用 `card-hover` 效果。

**Step 4: 发现页 UI**

修改 `src/app/page.tsx`：

衬线体大标题 "探索题库"，副标题 "每日一题，温故知新"。
搜索框（浅底色 + 微圆角 + 左侧放大镜图标）+ 双列卡片网格 + 分页 + 右下角浮动"创建题库"按钮。

**Step 5: 创建题库页 UI**

创建 `src/app/bank/new/page.tsx`：

表单：题库名称 + 描述（可选）。底部单线输入框风格。提交后跳转到题库详情页。

**Step 6: 题库详情页 UI**

创建 `src/app/bank/[id]/page.tsx`：

显示题库信息、订阅设置区域、题目列表表格。
创建者视角：可编辑/删除/发布。订阅者视角：只看已发布题目。

**Step 7: 验证 CRUD 流程**

```bash
pnpm dev
```

Expected: 可以创建题库、在发现页看到、点击进入详情。

**Step 8: Commit**

```bash
git add .
git commit -m "feat: implement question bank CRUD with discovery page, creation form, and detail view"
```

---

## Task 6: 题目 CRUD + 手动录入

**Files:**
- Create: `src/app/api/banks/[id]/questions/route.ts` (GET, POST)
- Create: `src/app/api/questions/[id]/route.ts` (PATCH, DELETE)
- Create: `src/app/api/banks/[id]/questions/publish/route.ts`
- Create: `src/app/bank/[id]/edit/page.tsx`
- Create: `src/components/question/question-form.tsx`
- Create: `src/components/question/question-list.tsx`
- Create: `src/components/question/review-panel.tsx`

**Step 1: 题目 API**

- `GET /api/banks/[id]/questions`：获取题库下题目列表，支持 `?status=DRAFT|PUBLISHED` 筛选
- `POST /api/banks/[id]/questions`：添加单条题目（手动录入），默认 status=DRAFT, source=MANUAL
- `PATCH /api/questions/[id]`：编辑题目（仅题库创建者）
- `DELETE /api/questions/[id]`：删除题目（仅题库创建者）
- `POST /api/banks/[id]/questions/publish`：批量发布，参数 `{ questionIds: string[] }`

**Step 2: 手动录入表单组件**

创建 `src/components/question/question-form.tsx`：

题干 textarea + 四个选项输入框 + 正确答案 Select + 解析 textarea。底部单线输入风格。

**Step 3: 题目列表组件**

创建 `src/components/question/question-list.tsx`：

表格展示题目，显示序号、题干（截断）、状态标签（草稿/已发布）、操作按钮。

**Step 4: 草稿审核面板**

创建 `src/components/question/review-panel.tsx`：

逐题审核模式：显示当前题目的所有字段（均可编辑），底部三个按钮「通过」「跳过」「删除」，进度条显示审核进度。

**Step 5: 编辑页 UI**

创建 `src/app/bank/[id]/edit/page.tsx`：

Tab 切换：手动录入 / 题目管理。包含 question-form 和 question-list 组件。

**Step 6: 验证手动录入流程**

Expected: 可以手动添加题目（进入草稿状态），编辑、审核、发布。

**Step 7: Commit**

```bash
git add .
git commit -m "feat: implement question CRUD with manual input, review panel, and batch publish"
```

---

## Task 7: LLM 抽象层 + AI 题目生成

**Files:**
- Create: `src/lib/llm/provider.ts`
- Create: `src/lib/llm/openai.ts`
- Create: `src/lib/llm/deepseek.ts`
- Create: `src/lib/llm/prompts.ts`
- Create: `src/app/api/banks/[id]/generate/text/route.ts`

**Step 1: 定义 LLM 抽象接口**

创建 `src/lib/llm/provider.ts`：

```typescript
import type { GeneratedQuestion } from "@/types";

export interface LLMProvider {
  generateQuestions(text: string, count?: number): Promise<GeneratedQuestion[]>;
}

export function createLLMProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER || "openai";
  switch (provider) {
    case "deepseek":
      return new (require("./deepseek").DeepSeekProvider)();
    case "openai":
    default:
      return new (require("./openai").OpenAIProvider)();
  }
}
```

**Step 2: 编写 Prompt 模板**

创建 `src/lib/llm/prompts.ts`：

系统 Prompt 要求 LLM 从给定文本中提取知识点，生成标准单选题，输出 JSON 数组格式。
包含 few-shot example 确保输出格式一致。

**Step 3: OpenAI 实现**

创建 `src/lib/llm/openai.ts`：

使用 `openai` SDK，读取 `LLM_API_KEY`、`LLM_API_BASE_URL`、`LLM_MODEL` 环境变量。
调用 chat completion，解析 JSON 响应。

**Step 4: DeepSeek 实现**

创建 `src/lib/llm/deepseek.ts`：

DeepSeek 兼容 OpenAI API 格式，复用大部分代码，仅替换 base URL 和默认 model。

**Step 5: 文本生成 API**

创建 `src/app/api/banks/[id]/generate/text/route.ts`：

- `POST`：参数 `{ text: string, count?: number }`
- 调用 LLM 生成题目
- 题目以 DRAFT + AI_GENERATED 状态入库
- 返回生成的题目列表

**Step 6: 在 UI 中添加 AI 文本生成 Tab**

在 `src/app/bank/[id]/edit/page.tsx` 中添加"文本粘贴"Tab：
大文本输入框 + 生成题数选择 + "AI 生成题目"按钮。
生成后自动跳转到审核面板。

**Step 7: 验证 AI 生成流程**

Expected: 粘贴一段文本 → 点击生成 → 题目以草稿状态出现 → 可审核发布。

**Step 8: Commit**

```bash
git add .
git commit -m "feat: implement LLM abstraction layer with OpenAI/DeepSeek providers and text-to-questions generation"
```

---

## Task 8: 文件导入 + URL 解析

**Files:**
- Create: `src/lib/parser/excel.ts`
- Create: `src/lib/parser/jina.ts`
- Create: `src/lib/parser/document.ts`
- Create: `src/app/api/banks/[id]/generate/file/route.ts`
- Create: `src/app/api/banks/[id]/generate/url/route.ts`

**Step 1: Excel/CSV 解析器**

创建 `src/lib/parser/excel.ts`：

使用 `xlsx` 库解析上传的 Excel/CSV 文件。
按固定列头映射：`题干 | 选项A | 选项B | 选项C | 选项D | 正确答案 | 解析`。
返回 `GeneratedQuestion[]`。

**Step 2: Jina Reader URL 解析**

创建 `src/lib/parser/jina.ts`：

调用 `https://r.jina.ai/<url>` 将网页转为 Markdown 文本。
返回纯文本内容。

**Step 3: 长文档切片逻辑**

创建 `src/lib/parser/document.ts`：

接收长文本，按 2000 字切片（尊重段落边界，不在句子中间切断）。
分批调用 LLM 生成题目，合并结果。

**Step 4: 文件导入 API**

创建 `src/app/api/banks/[id]/generate/file/route.ts`：

- `POST`：接收 multipart/form-data 文件上传
- 根据文件类型（xlsx/csv vs docx/pdf）选择解析路径
- Excel/CSV → 直接映射入库（DRAFT + EXCEL_IMPORT）
- Word/PDF → 提取文本 → 切片 → LLM 生成（DRAFT + AI_GENERATED）

**Step 5: URL 解析 API**

创建 `src/app/api/banks/[id]/generate/url/route.ts`：

- `POST`：参数 `{ url: string, count?: number }`
- Jina Reader 获取 Markdown → 切片 → LLM 生成

**Step 6: 在 UI 中添加文件上传和 URL 解析 Tab**

在 edit 页面添加：
- "文件上传"Tab：拖拽上传区域，支持 .xlsx/.csv/.docx/.pdf
- "URL 解析"Tab：URL 输入框 + 生成题数 + 生成按钮

**Step 7: 验证文件和 URL 导入**

Expected: 上传 Excel → 题目直接进入草稿；输入 URL → AI 生成题目进入草稿。

**Step 8: Commit**

```bash
git add .
git commit -m "feat: add file import (Excel/CSV/Word/PDF) and URL parsing with Jina Reader"
```

---

## Task 9: 订阅管理

**Files:**
- Create: `src/app/api/subscriptions/route.ts` (POST subscribe)
- Create: `src/app/api/subscriptions/[id]/route.ts` (PATCH, DELETE)
- Create: `src/app/api/subscriptions/mine/route.ts` (GET)
- Create: `src/components/bank/subscription-panel.tsx`

**Step 1: 订阅 API**

- `POST /api/subscriptions`：参数 `{ bankId, pushTimes: string[] }`。创建订阅，同时更新 QuestionBank.subscriberCount +1。
- `PATCH /api/subscriptions/[id]`：修改推送时间配置 `{ pushTimes }`
- `DELETE /api/subscriptions/[id]`：取消订阅，subscriberCount -1
- `GET /api/subscriptions/mine`：获取当前用户所有订阅，包含题库信息和推送进度

**Step 2: 订阅面板组件**

创建 `src/components/bank/subscription-panel.tsx`：

显示在题库详情页中。包含：
- 推送时间配置（时间选择器，支持添加/删除时间点）
- 订阅/取消订阅按钮
- 已订阅状态时显示推送进度（已推送/总题数）

**Step 3: 集成到题库详情页**

在 `src/app/bank/[id]/page.tsx` 中引入 subscription-panel 组件。

**Step 4: 验证订阅流程**

Expected: 在题库详情页订阅 → 配置推送时间 → 个人中心看到订阅。

**Step 5: Commit**

```bash
git add .
git commit -m "feat: implement subscription management with push time configuration"
```

---

## Task 10: 推送引擎（适配器 + 选题算法 + 调度器）

**Files:**
- Create: `src/lib/push/adapter.ts`
- Create: `src/lib/push/selector.ts`
- Create: `src/lib/push/payload.ts`
- Create: `src/scheduler/index.ts`
- Create: `src/app/api/push/trigger/route.ts`
- Modify: `package.json` (添加 scheduler 启动脚本)

**Step 1: 推送适配器**

创建 `src/lib/push/adapter.ts`：

```typescript
import type { PushPayload } from "@/types";

export async function pushToTarget(payload: PushPayload): Promise<boolean> {
  const url = process.env.PUSH_API_URL;

  if (!url) {
    console.log("[PUSH MOCK]", JSON.stringify(payload, null, 2));
    return true;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return response.ok;
}
```

**Step 2: 选题算法**

创建 `src/lib/push/selector.ts`：

```typescript
import { prisma } from "@/lib/prisma";

export async function selectQuestion(userId: string, bankId: string) {
  // 优先：最新且未推送过的
  const unpushed = await prisma.question.findFirst({
    where: {
      bankId,
      status: "PUBLISHED",
      pushLogs: {
        none: { userId },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (unpushed) return unpushed;

  // 兜底：随机抽一道复习
  const count = await prisma.question.count({
    where: { bankId, status: "PUBLISHED" },
  });

  if (count === 0) return null;

  const skip = Math.floor(Math.random() * count);
  return prisma.question.findFirst({
    where: { bankId, status: "PUBLISHED" },
    skip,
  });
}
```

**Step 3: Payload 构造**

创建 `src/lib/push/payload.ts`：

```typescript
import type { Question } from "@prisma/client";
import type { PushPayload } from "@/types";

export function buildPayload(receiver: string, question: Question): PushPayload {
  return {
    receiver,
    question: question.content,
    options: question.options as string[],
    correctAnswer: question.correctAnswer,
    explanation: question.explanation,
  };
}
```

**Step 4: 调度器主进程**

创建 `src/scheduler/index.ts`：

```typescript
import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { selectQuestion } from "../lib/push/selector";
import { pushToTarget } from "../lib/push/adapter";
import { buildPayload } from "../lib/push/payload";

const prisma = new PrismaClient();

function getCurrentTimeHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

cron.schedule("* * * * *", async () => {
  const currentTime = getCurrentTimeHHMM();
  console.log(`[Scheduler] Tick at ${currentTime}`);

  const matchedSubs = await prisma.subscription.findMany({
    where: {
      isActive: true,
      pushTimes: { has: currentTime },
    },
    include: { user: true },
  });

  for (const sub of matchedSubs) {
    try {
      const question = await selectQuestion(sub.userId, sub.bankId);
      if (!question) continue;

      const payload = buildPayload(sub.userId, question);
      const success = await pushToTarget(payload);

      if (success) {
        await prisma.pushLog.create({
          data: {
            userId: sub.userId,
            questionId: question.id,
          },
        });
        console.log(`[Scheduler] Pushed to ${sub.user.name || sub.userId}`);
      }
    } catch (err) {
      console.error(`[Scheduler] Error for subscription ${sub.id}:`, err);
    }
  }
});

console.log("[Scheduler] Started. Checking every minute...");
```

**Step 5: 手动触发 API（调试用）**

创建 `src/app/api/push/trigger/route.ts`：

- `POST`：参数 `{ userId?, bankId? }`
- 手动触发一次推送逻辑，绕过定时调度
- 仅开发环境可用

**Step 6: 添加 package.json 脚本**

在 `package.json` 的 `scripts` 中添加：

```json
{
  "scheduler": "tsx src/scheduler/index.ts"
}
```

**Step 7: 验证推送流程**

```bash
# 终端 1
pnpm dev

# 终端 2
pnpm scheduler
```

Expected: 调度器启动后每分钟打印 tick，到达配置的推送时间后自动推送（console.log mock）。

**Step 8: Commit**

```bash
git add .
git commit -m "feat: implement push engine with adapter, selection algorithm, and node-cron scheduler"
```

---

## Task 11: 个人中心 Dashboard

**Files:**
- Create: `src/app/dashboard/page.tsx`
- Create: `src/app/api/dashboard/stats/route.ts`
- Create: `src/app/api/push/logs/route.ts`
- Create: `src/components/dashboard/stats-cards.tsx`
- Create: `src/components/dashboard/subscription-list.tsx`
- Create: `src/components/dashboard/push-history.tsx`

**Step 1: Dashboard 统计 API**

创建 `src/app/api/dashboard/stats/route.ts`：

返回：
- 已订阅题库数
- 今日已推送题数 / 今日应推送总数
- 我创建的题库数

**Step 2: 推送记录 API**

创建 `src/app/api/push/logs/route.ts`：

- `GET`：获取当前用户的推送历史，按时间倒序，支持分页
- 每条记录包含：推送时间、题库名、题目内容（截断）、正确答案

**Step 3: 统计卡片组件**

创建 `src/components/dashboard/stats-cards.tsx`：

三列统计卡片：已订阅 / 今日推送 / 我创建的。使用衬线体大数字 + 正文描述。

**Step 4: 订阅列表组件**

创建 `src/components/dashboard/subscription-list.tsx`：

展示每个订阅的：题库名、推送时间、今日已推 N/M 题、总进度条。
包含"编辑推送时间"入口。

**Step 5: 推送历史组件**

创建 `src/components/dashboard/push-history.tsx`：

时间线样式展示最近的推送记录。每条显示时间、题库、题目摘要。

**Step 6: Dashboard 页面**

创建 `src/app/dashboard/page.tsx`：

衬线体标题 "我的书房"。
依次排列：统计卡片 → 订阅列表 → 推送历史。
全部使用 page-enter 动画。

**Step 7: 验证 Dashboard**

Expected: 个人中心展示统计数据、订阅列表（可编辑推送时间）、推送历史。

**Step 8: Commit**

```bash
git add .
git commit -m "feat: implement personal dashboard with stats, subscription management, and push history"
```

---

## Task 12: 收尾与优化

**Files:**
- Modify: various files for polish

**Step 1: 空状态处理**

为所有列表页添加空状态 UI（插画 + 引导文案 + CTA）：
- 发现页无题库："尚无题库，成为第一个创建者"
- 订阅列表为空："书房空空如也，去探索一些有趣的题库"
- 推送历史为空："泡一杯茶，订阅后系统会按你设定时间送来今日一题"

使用书卷主题的浅卡片容器，搭配简笔线稿（书本/茶杯/阅读者）提升情感化体验。

**Step 2: Loading 状态**

为 API 调用添加 loading 状态：
- 列表加载：骨架屏（skeleton）使用暖色调
- 按钮提交：显示三个淡入淡出的 `· · ·`
- AI 生成：显示进度提示"正在解析文本，AI 生成中..."

**Step 3: 错误处理**

为所有 API 调用添加 toast 错误提示。使用 shadcn/ui Toast 组件，配色使用 `--error` 赭石棕。

**Step 4: 响应式适配**

确保所有页面在移动端（< 640px）正确展示：
- 卡片网格变为单列
- 导航栏使用 Sheet 组件做侧边栏菜单
- 表格使用卡片式列表替代

**Step 5: .env.example 最终检查**

确保 `.env.example` 包含所有环境变量，注释完善。

**Step 6: 最终验证**

```bash
pnpm build
```

Expected: 构建成功，无类型错误。

```bash
pnpm dev
# 另一终端
pnpm scheduler
```

Expected: 完整流程可走通——登录 → 创建题库 → 录入题目 → 订阅 → 推送。

**Step 7: Commit**

```bash
git add .
git commit -m "feat: add empty states, loading indicators, error handling, and responsive design"
```

---

## 执行检查清单

完成所有 Task 后，确认以下事项：

- [ ] `pnpm build` 无报错
- [ ] 登录流程正常（GitHub OAuth）
- [ ] 题库 CRUD 正常
- [ ] 手动录入题目 + 草稿审核 + 发布流程正常
- [ ] AI 文本生成题目正常
- [ ] Excel 导入正常
- [ ] URL 解析正常
- [ ] 订阅 + 推送时间配置正常
- [ ] 调度器按时推送正常（console.log mock 验证）
- [ ] 个人中心数据正确
- [ ] 移动端响应式正常
- [ ] 文艺书卷风 UI 整体协调
