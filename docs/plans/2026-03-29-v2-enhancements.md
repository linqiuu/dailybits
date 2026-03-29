# v2 功能增强设计文档

> 日期：2026-03-29
> 状态：已实现

## 概述

本次迭代共涉及 20 项功能增强，涵盖题库可见性、评论系统、订阅结束条件、批量操作、UI 优化与权限管控等方面。

---

## 1. 首页交流群展示

- 在 `.env` 中配置 `GROUP_CHAT_ID`，首页顶部显示「加入交流群」卡片
- 未配置时隐藏该入口

## 2. JSON 批量导入题目

- 题库编辑页新增「JSON 导入」Tab
- 支持粘贴 JSON 文本批量录入一个或多个题目
- JSON 格式示例：

```json
[
  {
    "content": "题干内容",
    "options": ["A. 选项1", "B. 选项2", "C. 选项3", "D. 选项4"],
    "correctAnswer": "A",
    "explanation": "解析说明"
  }
]
```

- API：`POST /api/banks/[id]/questions` 支持接收单个对象或数组

## 3. 订阅结束条件

### 数据模型

新增枚举 `EndCondition`：

| 值 | 说明 |
|---|---|
| `END_AFTER_COMPLETE` | 推送完所有题目后结束（默认） |
| `REPEAT_N_TIMES` | 推送完后循环 N 次 |

`Subscription` 新增字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `endCondition` | EndCondition | 结束条件 |
| `repeatCount` | Int | 循环次数（仅 REPEAT_N_TIMES） |
| `currentCycle` | Int | 当前已完成循环数 |

### 调度器逻辑

- 当所有题目均已推送，检查 `endCondition`：
  - `END_AFTER_COMPLETE`：设 `isActive = false`
  - `REPEAT_N_TIMES`：清除该订阅的 PushLog，`currentCycle++`，若达到 `repeatCount` 则结束

## 4. 评论系统

### 数据模型

新增 `Comment` 模型：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | cuid | 主键 |
| `content` | String | 评论内容 |
| `bankId` | String | 所属题库 |
| `userId` | String | 评论者 |
| `parentId` | String? | 父评论 ID（回复） |
| `likeCount` | Int | 点赞数 |

新增 `CommentLike` 模型（`commentId + userId` 唯一约束）。

### 评论层级

- 最多两级：顶级评论 → 回复（不支持更深嵌套）
- 对回复的再次回复会出现在同一层级（第二级），并显示 `@被回复者`

### API

| 路由 | 方法 | 说明 |
|---|---|---|
| `/api/banks/[id]/comments` | GET | 评论列表（支持 sort=latest/likes、分页、parentId） |
| `/api/banks/[id]/comments` | POST | 创建评论 / 回复 |
| `/api/comments/[commentId]` | DELETE | 删除评论（作者或题库创建者） |
| `/api/comments/[commentId]/like` | POST | 点赞 / 取消点赞 |

## 5. 创建题库按钮位置

- 从右下角悬浮按钮移至搜索栏右侧，更醒目
- 仅登录用户可见

## 6. 复制 JSON 功能

- 题目列表增加「复制 JSON」按钮
- 复制选中题目（或全部题目）的 JSON 数据到剪贴板

## 7. 批量删除题目

- 题目列表支持复选框多选
- 选中后显示「批量删除」按钮
- API：`POST /api/banks/[id]/questions/batch-delete`，仅题库创建者可操作

## 8. 草稿排序优先

- 题目列表中，草稿状态的题目排在已发布题目之上

## 9. AI 生成预览

- AI 生成的题目先以草稿状态存入
- 用户在「题目管理」Tab 预览后再选择发布

## 10. 显示创建者 UID

- 题库卡片、题库详情页均显示创建者 `name` 和 `uid`

## 11. 题库可见性控制

### 数据模型

新增枚举 `Visibility`：

| 值 | 说明 |
|---|---|
| `PRIVATE` | 仅创建者可见（默认） |
| `PUBLIC` | 所有人可见 |
| `PARTIAL` | 指定部门可见 |

`QuestionBank` 新增字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `visibility` | Visibility | 可见性 |
| `visibleDepartments` | String[] | 可见部门列表（PARTIAL 时使用） |

### 可见性判定逻辑

1. 创建者始终可见
2. `PUBLIC`：所有人可见
3. `PRIVATE`：仅创建者可见
4. `PARTIAL`：用户部门列表与 `visibleDepartments` 有交集即可见

### 部门查询

- 配置 `DEPARTMENT_API_URL` 时代理到真实接口
- 未配置时返回打桩数据
- API：`GET /api/departments`

## 12. 订阅人数统计调整

- 「订阅人数」改为统计「曾经订阅过的人数」（包含已取消的订阅）
- 文案从「人订阅」改为「人订阅过」

## 13. 默认跳转登录

- 通过 `middleware.ts` 实现：未登录用户访问大部分路径时重定向到 `/login`
- 排除：`/login`、`/api/*`、`/group/*`、静态资源

## 14. 群号路由校验

- `/group/[groupId]` 路由校验 `groupId` 为纯数字
- 非数字返回 404
- API 层面对群号进行 400 校验

## 15. 群订阅登录要求

- 群订阅操作需要用户登录
- 订阅记录显示操作人信息（name + uid）
- `Subscription` 新增 `subscriberId` 字段关联 User

## 16. 部门查询接口打桩

- `GET /api/departments`：需要登录
- 若 `DEPARTMENT_API_URL` 已配置，携带用户 `uid` 代理请求
- 否则返回 mock 数据

---

## 新增环境变量

| 变量 | 说明 | 必填 |
|---|---|---|
| `GROUP_CHAT_ID` | 首页交流群号 | 否 |
| `DEPARTMENT_API_URL` | 部门查询真实接口 | 否 |
| `SCHEDULER_TIMEZONE` | 调度器时区 | 否（默认 Asia/Shanghai） |
| `HOLIDAY_COUNTRY` | 节假日国家代码 | 否（默认 CN） |
| `SKIP_NON_WORKING_DAYS` | 是否跳过非工作日 | 否（默认 true） |

## 新增 / 修改的 API 汇总

| 路由 | 方法 | 变更说明 |
|---|---|---|
| `POST /api/banks` | POST | 新增 visibility、visibleDepartments |
| `GET /api/banks` | GET | 可见性过滤 |
| `GET /api/banks/[id]` | GET | 可见性权限校验 |
| `PATCH /api/banks/[id]` | PATCH | 支持更新可见性 |
| `POST /api/banks/[id]/questions` | POST | 支持数组（JSON 批量导入） |
| `POST /api/banks/[id]/questions/batch-delete` | POST | 新增：批量删除 |
| `GET /api/banks/[id]/comments` | GET | 新增：评论列表 |
| `POST /api/banks/[id]/comments` | POST | 新增：创建评论 |
| `DELETE /api/comments/[commentId]` | DELETE | 新增：删除评论 |
| `POST /api/comments/[commentId]/like` | POST | 新增：点赞切换 |
| `GET /api/departments` | GET | 新增：部门查询 |
| `POST /api/subscriptions` | POST | 新增 endCondition、repeatCount、subscriberId |
| `PATCH /api/subscriptions/[id]` | PATCH | 支持更新 endCondition、repeatCount |
| `GET /api/dashboard/stats` | GET | subscribedCount 改为历史总计 |

## 数据库迁移

本次新增一次 Prisma 迁移，变更内容：

- 新增 `Visibility` 枚举、`EndCondition` 枚举
- `QuestionBank` 新增 `visibility`、`visibleDepartments` 字段
- `Subscription` 新增 `endCondition`、`repeatCount`、`currentCycle`、`subscriberId` 字段
- 新增 `Comment` 模型（含索引）
- 新增 `CommentLike` 模型（含唯一约束）
