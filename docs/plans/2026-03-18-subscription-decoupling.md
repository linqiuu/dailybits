# Subscription 解耦与群组看板重构

> 日期：2026-03-18

## 目标

将 Subscription 模型从 User 解耦，引入多态归属概念（USER / GROUP），支持个人和群组订阅题库，新增群组免登录看板页面。

## 架构变更

### 数据库 Schema

**新增枚举 `TargetType`：**

```
USER   -- 个人订阅，targetId = user.id
GROUP  -- 群组订阅，targetId = 外部群组标识（如 Webhook ID）
```

**Subscription 模型重构：**

| 变更 | 旧字段 | 新字段 |
|------|--------|--------|
| 移除 | `userId` (FK -> User) | - |
| 新增 | - | `targetType` (TargetType, 默认 USER) |
| 新增 | - | `targetId` (String) |
| 修改 | `pushTimes` 无默认值 | `pushTimes` 默认 `["09:30", "14:00", "17:00"]` |
| 约束 | `@@unique([userId, bankId])` | `@@unique([targetType, targetId, bankId])` |

**PushLog 模型重构：**

同样从 `userId` 迁移到 `targetType` + `targetId`，移除与 User 的外键关系。

**User 模型：**

移除 `subscriptions` 和 `pushLogs` 关系字段。

### 迁移策略

使用自定义迁移 SQL 保留现有数据：先添加新列并从 `userId` 复制数据到 `targetId`，再删除旧列和约束。

迁移文件：`prisma/migrations/20260318120000_decouple_subscription_target/migration.sql`

---

## 业务规则

| 规则 | 值 |
|------|----|
| 每个 target 最多订阅题库数 | 5 |
| 每个订阅最多推送时间点数 | 10 |
| pushTimes 默认值 | `["09:30", "14:00", "17:00"]` |

常量定义在 `src/types/index.ts`。

---

## API 变更

### 现有 API 改造

| 路由 | 变更说明 |
|------|----------|
| `POST /api/subscriptions` | 接受 `targetType` + `targetId`；USER 类型需认证，GROUP 类型从请求体获取 targetId；新增限额校验 |
| `PATCH /api/subscriptions/[id]` | 根据 `targetType` 决定鉴权方式；新增 pushTimes 上限校验 |
| `DELETE /api/subscriptions/[id]` | 同上鉴权变更 |
| `GET /api/subscriptions/mine` | 查询条件改为 `targetType=USER, targetId=session.user.id` |
| `GET /api/banks` | 默认排序改为 `subscriberCount desc`；支持 `targetType` + `targetId` 查询参数；返回 `subscriptionCount` |
| `GET /api/banks/[id]` | 订阅查询使用新的复合唯一键 |
| `GET /api/dashboard/stats` | 使用 targetType/targetId 查询 |
| `GET /api/push/logs` | 使用 targetType/targetId 查询 |
| `POST /api/push/trigger` | 适配新模型，查询 user 获取 receiver |

### 新增群组 API（免认证）

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/group/[groupId]/subscriptions` | GET | 获取群组所有订阅（含题库信息和推送进度） |
| `/api/group/[groupId]/subscriptions` | POST | 为群组创建订阅（校验 5 个上限） |
| `/api/group/[groupId]/subscriptions/[id]` | PATCH | 更新推送时间 |
| `/api/group/[groupId]/subscriptions/[id]` | DELETE | 取消订阅 |

---

## 调度器变更

文件：`src/scheduler/index.ts`

- `selectQuestion` 参数从 `userId` 改为 `(targetType, targetId, bankId)`
- 推送 receiver 解析：USER 类型查 User.uid，GROUP 类型直接用 targetId
- PushLog 写入使用 targetType + targetId
- 新增 `SCHEDULER_TIMEZONE` 环境变量（默认 `Asia/Shanghai`）
- `getCurrentTimeHHMM()` 使用 `toLocaleTimeString` 支持时区

---

## 新增页面

### 群组看板 `/group/[groupId]`

- 不需要 NextAuth 认证（公开页面）
- 展示群组所有订阅的题库列表
- 支持添加/删除订阅、修改推送时间
- 显示订阅上限状态

文件：
- `src/app/group/[groupId]/page.tsx` -- 服务端页面
- `src/components/group/group-dashboard.tsx` -- 群组看板客户端组件
- `src/components/group/bank-selector.tsx` -- 题库选择器组件

---

## 前端 UI 变更

### BankCard (`src/components/bank/bank-card.tsx`)

- 新增 `subscriptionCount` prop
- 达到 5 个订阅时，订阅按钮替换为灰色 Badge `订阅数已满 5/5`
- 订阅弹窗预填默认时间 `["09:30", "14:00", "17:00"]`
- 时间达到 10 个时禁用添加按钮，显示 `已达上限 10/10`

### BankExplorer (`src/components/bank/bank-explorer.tsx`)

- 从 API 响应获取 `subscriptionCount` 传递给 BankCard
- 排序由后端处理（subscriberCount desc）

### SubscriptionPanel (`src/components/bank/subscription-panel.tsx`)

- 编辑推送时间弹窗中，时间达到 10 个时禁用添加按钮，显示上限提示

---

## 文件变更清单

### 修改文件

| 文件 | 变更类型 |
|------|----------|
| `prisma/schema.prisma` | 新增 TargetType 枚举，重构 Subscription 和 PushLog |
| `src/types/index.ts` | 新增类型和常量 |
| `src/app/api/subscriptions/route.ts` | 全面重写 POST |
| `src/app/api/subscriptions/[id]/route.ts` | 全面重写 PATCH/DELETE |
| `src/app/api/subscriptions/mine/route.ts` | 适配 targetType/targetId |
| `src/app/api/banks/route.ts` | 默认排序、subscriptionCount |
| `src/app/api/banks/[id]/route.ts` | 适配新唯一键 |
| `src/app/api/dashboard/stats/route.ts` | 适配 targetType/targetId |
| `src/app/api/push/logs/route.ts` | 适配 targetType/targetId |
| `src/app/api/push/trigger/route.ts` | 全面重写 |
| `src/app/bank/[id]/page.tsx` | 适配新唯一键 |
| `src/lib/push/selector.ts` | 参数改为 targetType/targetId |
| `src/scheduler/index.ts` | 全面重写推送逻辑 |
| `src/components/bank/bank-card.tsx` | 新增订阅上限、时间上限、默认时间 |
| `src/components/bank/bank-explorer.tsx` | 传递 subscriptionCount |
| `src/components/bank/subscription-panel.tsx` | 时间上限提示 |

### 新增文件

| 文件 | 说明 |
|------|------|
| `prisma/migrations/20260318120000_decouple_subscription_target/migration.sql` | 数据库迁移 |
| `src/app/api/group/[groupId]/subscriptions/route.ts` | 群组订阅 GET/POST |
| `src/app/api/group/[groupId]/subscriptions/[id]/route.ts` | 群组订阅 PATCH/DELETE |
| `src/app/group/[groupId]/page.tsx` | 群组看板页面 |
| `src/components/group/group-dashboard.tsx` | 群组看板组件 |
| `src/components/group/bank-selector.tsx` | 题库选择器 |

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SCHEDULER_TIMEZONE` | `Asia/Shanghai` | 调度器时区 |
