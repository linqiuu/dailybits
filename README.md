# DailyBits

DailyBits 是一个面向碎片化学习场景的知识推送平台，支持题库管理、AI 题目生成、多时段订阅推送与学习统计看板。

## 项目目标

将「内容沉淀 + 间隔复习 + 自动推送」整合为轻量、可扩展、可二次开发的学习系统。

## 核心能力

- 题库管理：创建、编辑、删除与发布题目，支持可见性控制（私有 / 公开 / 部门可见）
- 部门范围：按 Directory v1 部门搜索保存稳定部门 ID，并保留展示名用于界面回显
- 多源录入：手动输入、JSON 批量导入、文本生成、文件导入、URL 解析
- AI 抽象层：通过环境变量切换模型服务，生成后支持预览再发布
- 定时推送：题库创建者可固定每日 / 每周推送时间，也可允许订阅者自定义多个时间点
- 学习订阅：固定本期内容后结束，或持续跟进新增；题目复习轮数独立设置
- 数据看板：订阅、推送、创建内容、答题人数与正确率统计
- 管理员总览：题库总数、题目总量、答题趋势与使用量排行
- 评论系统：题库评论与回复、点赞，支持最新 / 最热排序
- 群组订阅：支持群组看板和订阅管理，标识操作人身份
- 批量操作：批量删除题目、复制题目 JSON、JSON 批量导入

## 技术栈

- Next.js (App Router) + TypeScript
- Tailwind CSS + shadcn/Base UI + Lucide
- Recharts（答题趋势）+ react-markdown / remark-gfm（真实推送预览）
- Auth Hub 网关统一认证
- Prisma + PostgreSQL
- node-cron（独立调度进程）
- OpenAI / 兼容模型服务

## 系统架构

采用「单 Next.js 应用 + 独立 Scheduler 进程」模式：

- Web 层：页面与 API 路由
- 业务层：`src/lib` 沉淀核心逻辑
- 调度层：每分钟生成持久化任务，三类独立消费者处理；通过数据库租约、幂等键和有限重试恢复故障
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
AUTH_MODE="dev"
DEV_USER_ID="local-admin"
DEV_USER_UID="local-admin"
DEV_USER_NAME="Local Admin"
DEV_USER_EMAIL="local-admin@example.test"
DEV_USER_DEPARTMENT="本地开发"
LLM_PROVIDER="openai"
LLM_API_KEY=""
LLM_API_BASE_URL=""
LLM_MODEL="gpt-4o-mini"
PUSH_PROVIDER="generic"
PUSH_API_URL=""
INNER_API_BASE_URL="http://127.0.0.1:4010"
INNER_API_KEY=""
INNER_API_KEY_HEADER="X-Inner-API-Key"
MESSAGING_API_BASE_URL=""
MESSAGING_INNER_API_KEY=""
MESSAGING_INNER_API_KEY_HEADER=""
MESSAGING_CARD_SEND_PATH="/messaging/v1/cards/send"
MESSAGING_TIMEOUT_MS="15000"
MESSAGING_RETRY_ATTEMPTS="3"
MESSAGING_RETRY_BASE_MS="1000"
MESSAGING_MAX_RETRY_DELAY_MS="30000"
CARD_SERVICE_API_BASE=""
CARD_SERVICE_SEND_API_KEY=""
CARD_SERVICE_SEND_API_KEY_HEADER="X-Card-Service-Key"
CARD_SERVICE_QA_PATH="/send/qa"
CARD_SERVICE_QA_ANSWER_CALLBACK_URL="" # 例如 https://dailybits.example.com/api/card-events/qa-answer
CARD_SERVICE_EVENT_SECRET=""
CARD_SERVICE_EVENT_SECRET_HEADER="X-Card-Event-Secret"
JINA_API_KEY=""
GROUP_CHAT_ID=""              # 首页展示交流群号（选填）
DIRECTORY_API_BASE_URL="http://127.0.0.1:4010"
DIRECTORY_INNER_API_KEY=""
DIRECTORY_INNER_API_KEY_HEADER="X-Inner-API-Key"
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

## 统一认证

生产环境默认 `AUTH_MODE=gateway`，应用不提供 OAuth callback，不保存 OAuth secret、access token 或 refresh token。当前用户由 Auth Hub 网关注入的 `X-User-Base64` 或 `X-User-*` 请求头解析，前端只通过同源 `GET /api/me` 获取当前用户。

本地开发需要显式设置 `AUTH_MODE=dev` 和 `DEV_USER_*`。如果在生产构建或生产运行环境里设置 `AUTH_MODE=dev`，应用会拒绝启动。部署到公司网络时，DailyBits 所在机器的真实 IP:port 应只允许 Auth Hub/Nginx 来源访问。

## 部门与订阅策略

题库部门可见性通过 Directory v1 接入：前端调用同源 `GET /api/directory/departments/search?q=关键词`，服务端再代理到 `DIRECTORY_API_BASE_URL/directory/v1/departments/search`。保存到 `QuestionBank.visibleDepartments` 的是 `department.id`，展示名保存到 `visibleDepartmentNames` 仅用于界面回显。

Auth Hub 身份中如果包含 `X-User-Base64.departments[].department.id` 或其 `path[].id`，DailyBits 会用这些稳定 ID 判断用户是否属于题库允许部门。`X-User-Department` 只适合作为展示名，不应用来当部门 code。

题库创建者可以选择两种订阅策略：

- 订阅者自定义：用户订阅时选择自己的推送时间。
- 创建者固定：创建者设置每日或每周固定时间，用户点击订阅即可，不再选择时间。

独立 Scheduler 按 `SCHEDULER_TIMEZONE`（默认 `Asia/Shanghai`）生成持久化 `DeliveryJob`。恢复后默认补发最近 6 小时内的漏发任务；首次启动只扫描最近一分钟，不会把历史订阅全部重发。`SKIP_NON_WORKING_DAYS=true` 时按原定日期排除周末及节假日。群订阅仅允许公开内容，并由创建该群订阅的人或管理员维护。

### 学习范围与结束规则

题库和知识库创建者可设置 `recommendedSubscriptionMode`，用户订阅时确认自己的模式；之后修改推荐值不会改变已有订阅。

- `CURRENT_EDITION`（学完本期结束）：订阅时保存已发布题目 ID 或当前知识点 ID 的固定集合。新增内容、原先草稿后续发布都不进入本期；题目下架/删除后不再发送。最后一条内容被上游接收且历史记录入库后，立即标记完成，不以用户是否答题为条件。
- `FOLLOW_UPDATES`（持续跟进更新）：仅推送尚未接收过的内容 ID。没有新内容时保持订阅并等待，下次约定推送时间检查新增；旧内容的正文、答案或顺序修改不触发重推。知识卡片不再默认从头循环。
- 题目「额外复习轮数」与模式分开设置，仅对本期固定集合生效。例如额外复习 2 轮，对应兼容字段 `endCondition=REPEAT_N_TIMES, repeatCount=3`，总共推送 3 轮；持续模式不允许复习旧题。
- 状态分别为 `ACTIVE`（推送中）、`WAITING`（等待更新）、`COMPLETED`（本期完成）、`PAUSED`（暂停）与 `CANCELLED`（取消）。暂停保留范围和进度，也占订阅配额；继续推送不会补发暂停期间的时段。取消或完成后必须显式重新订阅，题库更新永不恢复它们。
- 已有订阅的模式不能在编辑设置时静默切换。用户先取消再按新模式重新订阅：本期模式开启新一期，持续模式保留既有推送历史，只跟进未推送内容。

状态操作使用现有个人、群组、知识订阅 PATCH 接口的 `{ "action": "pause" }` / `{ "action": "resume" }`；DELETE 为取消。状态操作不能与设置修改混用，创建者固定推送时间仍不可由订阅者修改。已完成订阅保留在列表中，进度按本期/当前复习轮计算。

升级前停止旧 Web 与 Scheduler，执行 migration `20261015090000_learning_subscription_policy` 后再启动新版本。旧活跃题库订阅固定为升级时已发布的题目集合，并保留当前轮数与历史；旧活跃知识订阅改为跟进未推送内容，历史卡片不自动重播。旧停用记录缺少结束原因，统一保守地保持取消状态，不能推测成待恢复订阅。数据库约束保证 `isActive` 与新状态一致，不能混跑新旧 Scheduler 或回滚旧代码直接写新数据库。

暂停/取消可以阻止尚未发送的任务；上游已经接收或正在传输的卡片不能撤回，迟到回执仍会保存，但不会恢复订阅状态。发卡任务绑定订阅轮次，重新订阅不会执行旧一期的排队任务。

## 卡片服务与答题回流

### 网站答题明细与导出

题库创建者和管理员可以在题库详情的「答题记录」页签查看个人答题明细；「我的内容」中的题库也提供直达入口。普通订阅者无权查看或导出其他人的个人记录。

- 展示姓名、工号、题目、所选答案、正确答案、正确情况和答题时间，详情可查看资料采集时间和题目快照来源。
- 支持姓名/工号/账号搜索，按题目、正确情况、日期筛选，以及最新/最早作答、错误/正确优先的全量排序。
- Excel 导出当前筛选条件下的全部记录，不受当前页影响；单次最多 50000 条，超过时要求缩小范围，不会静默截断。工号按文本保留前导零，所有展示和导出时间采用北京时间。
- 姓名与工号由 Scheduler 每分钟批量请求 Directory v1 `POST /directory/v1/users/batch-resolve` 补全。正式环境的 Directory Key 必须具备 `directory.user.read`，仅有部门搜索权限不够。优先使用 `DIRECTORY_API_BASE_URL` / `DIRECTORY_INNER_API_KEY`，也可复用 `INNER_API_BASE_URL` / `INNER_API_KEY`；密钥只保存在服务端环境变量中。
- 人员目录失败不会丢弃答题记录：姓名、工号显示待补全并有限重试，尊重 `Retry-After`；目录未找到的账号每七天重新查询一次。不截取账号猜测工号，不覆盖已经采集的人员快照。
- 更新部署时先执行 migration `20261014090000_answer_details`，然后同时更新 Web 和 Scheduler（Compose 的 `migrate` 服务会先行执行）。新增数据库字段不删除原有答题记录；历史记录的姓名/工号来自补全时的目录，并不代表答题当时的身份。旧记录没有题目快照时明确显示当前题目内容；新记录保存事件入库时的题目内容。

同源接口为 `GET /api/banks/:id/answers` 与 `GET /api/banks/:id/answers/export`，两者均要求登录并校验题库创建者或管理员权限。它们不是卡片回调接口，不可豁免网关登录。现有 card-service 答题事件已包含账号和答题时间，本次明细功能不要求修改其事件契约。

当 `PUSH_PROVIDER=card-service` 时，DailyBits 会把题目推送到 card-service `/send/qa`，并传入 `source_system=dailybits` 与 `business_id=Question.id`。如果配置了 `CARD_SERVICE_QA_ANSWER_CALLBACK_URL`，还会把答题回调地址和密钥随发卡请求传给 card-service。

AI 新闻、GitHub 热榜和知识卡片会通过公司 Messaging v1 `POST /messaging/v1/cards/send` 发送 Markdown 卡片。Digest 内容使用翻页卡片，`content` 直接传 Markdown 数组；默认每页 3 条、最多 4 页。每次业务发送都会带 `Idempotency-Key`，429/503/网络超时会按 `Retry-After` 或指数退避重试，401/403/400 不会自动重试。`INNER_API_KEY` 只从环境变量读取，不要提交到仓库或日志。

推荐配置：

```dotenv
PUSH_PROVIDER=card-service
CARD_SERVICE_API_BASE=https://card-service.example.com
CARD_SERVICE_SEND_API_KEY=...
CARD_SERVICE_QA_ANSWER_CALLBACK_URL=https://dailybits.example.com/api/card-events/qa-answer
CARD_SERVICE_EVENT_SECRET=...
INNER_API_BASE_URL=https://inner-api.company.internal
INNER_API_KEY=...
```

用户点击 QA 卡片答题后，card-service 会回调 DailyBits `/api/card-events/qa-answer`。DailyBits 按 `cardId + respondentId` 幂等保存 `QuestionAnswerEvent`，创建者看板会展示每个题库的答题人数、答题次数和正确数，管理员总览会展示全站题库规模、每日答题趋势和使用量排行。

需同时更新 card-service：`POST /send/qa` 必须支持稳定 `Idempotency-Key`；`GET /api/v1/qa/answers?source_system=dailybits&after_id=0` 支持递增游标。Scheduler 每分钟补拉答题事件，弥补回调失败。答题回调是机器接口，网关只对这个精确路径豁免登录，并保留共享密钥校验，不要豁免整个 `/api/*`。

管理员总览区分 `上游已接收`、`待处理`、`发送失败`、`发送结果待确认`，接收回执不等同于终端已送达。未知结果不会盲目重发，需核对上游后处理。取消订阅或重新开始题库不删除历史推送记录；新一轮题库进度独立计算。

## Docker 部署

项目已提供容器化配置，可一键启动 `Web + Scheduler + PostgreSQL`。同栈部署和迁库流程见 [docs/deployment-docker-compose.md](docs/deployment-docker-compose.md)。

### 1. 准备环境变量

```bash
cp .env.example .env
```

至少补齐以下变量（推荐）：

- 生产环境使用 `AUTH_MODE=gateway`，由公司 Auth Hub 网关注入 `X-User-*` 请求头
- `POSTGRES_PASSWORD` 必填，不提供生产默认密码
- `LLM_API_KEY`（如果使用 AI 生成能力）
- `PUSH_API_URL`（generic webhook 模式）
- 或 `PUSH_PROVIDER=card-service`、`CARD_SERVICE_API_BASE`、`CARD_SERVICE_SEND_API_KEY`（题目卡片走 card-service `/send/qa`）
- `INNER_API_BASE_URL`、`INNER_API_KEY`（资讯摘要和知识卡片走公司 Messaging v1；开发 Mock 可不填真实 Key）

> 容器启动脚本从统一 `POSTGRES_*` 构建数据库 URL，并编码密码，不需要手动维护两套配置。仅连接外部库时设置 `DOCKER_DATABASE_URL`。PG 默认没有宿主机端口；Web 默认绑定 `127.0.0.1:3000`。跨机器网关接入时用 `APP_BIND_IP` 指定内网监听地址，并通过防火墙限制来源。

### AI 新闻源

默认 `AI_NEWS_PROVIDER=aihot`、`AIHOT_DIGEST_MODE=daily`，每天固定推送时会读取 AIHOT v1 日报接口 `/api/v1/dailies/{YYYY-MM-DD}`；如果当天日报还没到 `AIHOT_DAILY_READY_TIME`，会自动使用上一期日报日期，避免推送空内容。

AIHOT 的旧 `/api/public/*` 外部接口已发布停服计划，本项目只使用 `/api/v1/*`。`AIHOT_DIGEST_MODE=selected` 可切换为 `/api/v1/items?mode=selected`，默认窗口为 `AIHOT_ITEMS_WINDOW=24h`、时间口径为 `AIHOT_ITEMS_BY=timeline`。

AIHOT 获取失败时会先走 `AI_NEWS_RSS_FEEDS` 的兜底源，默认优先使用 AIHOT 精选 RSS，再尝试 OpenAI、MIT 和 Hacker News。定时任务只会记录日志或跳过本轮，不会把接口错误当作新闻内容推给用户。

### 2. 构建并启动

```bash
docker compose up --build -d
```

默认服务：

- `migrate`：一次性执行 Prisma migration，避免 Web 和 Scheduler 同时迁移
- `app`：Next.js Web 服务（`http://localhost:3000`）
- `scheduler`：定时推送调度进程
- `db`：PostgreSQL 16

内部环境可在 `.env` 配置 `OUTBOUND_PROXY_URL`（GitHub、新闻、论文和外部模型请求），以及 `NPM_REGISTRY` / `APT_MIRROR` 等构建镜像源；均可不额外配置。内部卡片和 Directory/Messaging 接口保持直连。详细说明、构建凭证和私有 CA 配置见 [Docker Compose 部署文档](docs/deployment-docker-compose.md#代理和内部镜像源)。

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
- `npm test`：单元测试；指定 `TEST_DATABASE_URL` 后增加 PostgreSQL 故障恢复集成测试（必须使用独立测试库）
- `npm run scheduler`：运行定时调度

## 本地题库同步

项目支持从根目录下的 `question-banks/` 文件夹增量同步官方题库。该目录建议作为单独的私有题库仓库维护，并已在主项目 `.gitignore` 中忽略。

目录示例：

```text
learn/
├─ question-banks/
│  ├─ 英语.json
│  └─ AI周报.json
└─ package.json
```

同步前需要在 `.env` 中配置题库归属用户，可填写 `User.id`、`User.uid` 或 `User.email`：

```bash
QUESTION_SYNC_OWNER_UID="cmmqr2rw70000rctqyivhmcwe"
```

同步命令：

```bash
cd question-banks
git pull

cd ..
npm run sync:question-banks
```

每个 `.json` 文件会自动对应一个题库，文件名就是默认题库名，例如 `英语.json` 会创建或更新「英语」题库。默认同步只新增或更新题目，不会自动删除 JSON 中已经移除的旧题，避免影响订阅和历史推送记录。新增题目会以 `PUBLISHED` 状态导入；同步不会改变订阅状态，也不会重置推送轮次。只有持续订阅会在下一次约定时段跟进新题。

如果已有同名手动题库已经被用户订阅，可以先把它接管为本地同步题库：

```bash
npm run sync:question-banks -- --adopt-existing
```

`--adopt-existing` 会在找不到已绑定同步题库时，查找当前同步用户创建的唯一同名手动题库，并给它绑定 `externalSource=local-question-banks` 和对应的文件名 `externalSlug`。题库 `id` 不变，因此已有订阅不会迁移或丢失。

如果希望 JSON 成为题库的当前有效题目集合，可以使用替换模式：

```bash
npm run sync:question-banks -- --adopt-existing --replace
```

`--replace` 不会物理删除旧题，而是把不在 JSON 中的旧题改回 `DRAFT`，后续推送只会从 `PUBLISHED` 题目中选择。这样可以保留历史推送记录，也方便误操作后恢复。

最简单的题库格式是题目数组：

```json
[
  {
    "content": "Choose the correct word: I ___ to school every day.",
    "options": {
      "A": "go",
      "B": "goes",
      "C": "went",
      "D": "gone"
    },
    "correctAnswer": "A",
    "explanation": "The subject is I, so the base verb go is correct."
  }
]
```

也可以使用带元信息的格式：

```json
{
  "title": "英语",
  "description": "英语每日练习题库",
  "visibility": "PUBLIC",
  "questions": [
    {
      "content": "题干",
      "options": { "A": "选项 A", "B": "选项 B" },
      "correctAnswer": "A",
      "explanation": "解析"
    }
  ]
}
```

长期更新的 JSON 题目和知识卡片应提供不可变的字符串 `id`（也兼容 `slug` / `key`），例如 `"id": "ai-rag-001"`。保留同一 ID 后修改内容会更新原记录，不会作为新内容重推。给已有无 ID 内容补充 ID 时，应先保持原正文和答案不变同步一次，再修改正文；这样会接管原记录并保留推送历史。

无 ID 的旧题库仍兼容 `content + correctAnswer` 身份规则，无 ID 知识卡仍用正文匹配。这种情况下修改题干/答案或知识正文无法可靠区分“修改”与“新增”，会视为新内容；不要承诺它们修改后不重推，也不要用模糊相似度猜测身份。

## 项目文档

- 设计文档：`docs/plans/2026-03-15-knowledge-push-design.md`
- 实现计划：`docs/plans/2026-03-15-knowledge-push-implementation.md`
- 订阅解耦与群组重构：`docs/plans/2026-03-18-subscription-decoupling.md`
- v2 功能增强：`docs/plans/2026-03-29-v2-enhancements.md`

## 许可证

本项目基于 [MIT License](./LICENSE) 开源。
