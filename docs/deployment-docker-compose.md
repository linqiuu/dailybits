# DailyBits Docker Compose 部署

DailyBits 可以放在一个 Docker Compose 栈里运行：`db` 提供 PostgreSQL，`migrate` 负责一次性执行 Prisma migration，`app` 提供网页和 API，`scheduler` 负责定时推送。

## 服务依赖

| 服务 | 作用 | 备注 |
| --- | --- | --- |
| `db` | PostgreSQL 16 | 数据卷为 `postgres_data` |
| `migrate` | 执行 `prisma migrate deploy` | `app` 和 `scheduler` 会等待它完成 |
| `app` | Next.js Web/API | 默认仅监听 `127.0.0.1:3000`，`/api/health` 检查 DB |
| `scheduler` | 持久化任务与三类推送消费者 | 默认按 `Asia/Shanghai` 和中国工作日规则运行 |

## 首次部署

```bash
cp .env.example .env
docker compose up --build -d
```

`.env` 里至少要确认这些值：

- `AUTH_MODE=gateway`：生产环境必须走 Auth Hub 网关注入的用户头。
- `ADMIN_USER_IDS`：管理员用户 ID，多个值用逗号分隔。
- `POSTGRES_PASSWORD`：必填强密码，不提供生产默认值。
- `LLM_API_KEY`：需要 AI 生成题目或摘要时填写。
- `PUSH_PROVIDER`、`CARD_SERVICE_API_BASE`、`MESSAGING_API_BASE_URL`、`INNER_API_BASE_URL`：按实际卡片服务和公司 Messaging/Inner API 地址填写。
- `CARD_SERVICE_EVENT_SECRET`、`CARD_SERVICE_QA_ANSWER_CALLBACK_URL`：QA 答题回调配置，生产 card-service 模式必须配置。

默认 Compose 使用同栈数据库。容器启动时从同一组 `POSTGRES_DB/USER/PASSWORD` 构建 `DATABASE_URL`，特殊字符自动编码，无需同步另一份 URL。仅接入外部库时配置 `DOCKER_DATABASE_URL`（此时 URL 凭据需自行编码）。`DATABASE_URL` 留给宿主机本地开发。

PG 不映射端口，备份、导入、运维使用 `docker compose exec/cp` 即可。如果确实需要宿主机数据库客户端，使用 `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db`，只映射 `127.0.0.1:${POSTGRES_PORT:-5432}`，不要开放到公网。

Web 默认绑定回环地址；本机网关可直接访问。若 Auth Hub 网关在其他机器，用 `APP_BIND_IP` 设置内网地址并限制网关来源，禁止用户绕过网关伪造身份头。精确的 `/api/card-events/qa-answer` 和 `/api/health` 不依赖浏览器登录；答题回调仍要求服务密钥。其他用户 API 必须走网关。

Dockerfile 默认使用国内 apt/npm 镜像。海外 CI 或私有网络可以通过 build args 覆盖：

```bash
docker build \
  --build-arg APT_MIRROR=http://deb.debian.org/debian \
  --build-arg APT_SECURITY_MIRROR=http://deb.debian.org/debian-security \
  --build-arg NPM_REGISTRY=https://registry.npmjs.org \
  -t dailybits .
```

## 从旧库导入数据

导入时先不要启动 `app` 和 `scheduler`，尤其是 `scheduler`，避免迁移中途触发推送。

```bash
docker compose up -d db
```

从旧库导出：

```bash
pg_dump "$OLD_DATABASE_URL" -Fc --no-owner --no-acl -f dailybits.dump
```

导入到新容器：

```bash
docker compose cp dailybits.dump db:/tmp/dailybits.dump
docker compose exec db pg_restore --clean --if-exists --no-owner --no-acl -U postgres -d dailybits /tmp/dailybits.dump
docker compose run --rm migrate
docker compose up -d app scheduler
```

如果你在 `.env` 中改了库名或用户，请同步替换 `pg_restore -U ... -d ...` 参数。

## 迁移注意事项

- 保留原有主键 ID。题目卡片的答题回调会用 `Question.id` 作为业务标识，导入时不要重新生成题目 ID。
- 导入完成后先看 `app` 日志，再启动或恢复 `scheduler`。
- 如果旧库和当前 Prisma schema 不完全一致，先还原到空库，再运行 `docker compose run --rm migrate` 补齐结构。
- `User.id` 使用 Auth Hub 稳定 ID；用户首次登录按唯一 UID/邮箱匹配旧用户，并事务迁移所有个人订阅和历史 `targetId`。若稳定 ID、UID、邮箱指向不同用户，将拒绝自动合并，需人工核对后迁移。
- 部门可见配置须保存 Directory 稳定 ID。旧部门名称不会拿来猜权限；导入后请在编辑页重新选择对应部门。未再次登录的旧用户部门集合为空，部门限定推送暂缓，登录后会同步。
- 先升级 card-service，再启用新 Scheduler，确保 QA 幂等发送和 `after_id` 游标可用。

## 调度与故障恢复

- 默认补发窗口为 360 分钟，可配置 `SCHEDULER_CATCH_UP_MINUTES`（1 到 1440）。首次启动不会回放历史；窗口外的漏发不自动补发。
- 同一订阅任务顺序发送；数据库租约防止多消费者重复领取；租约超时 15 分钟后恢复。发送快照和幂等键不随重试改变。
- `Retry-After` 不会被提前缩短。最多 8 次任务尝试，超过窗口记为失败。取消或失去内容权限的任务不再发送。
- 上游接收回执保存后，本地记账失败只补记日志。无法确认上游是否发出的任务标记待确认，避免盲目重发。
- Messaging 契约要求重试复用幂等键，但平台仅向公司上游透传该键，Mock 不保证相同消息 ID。上线需确认公司消息适配器的实际去重保证；网络短重试耗尽后标记待确认，不再进行无限补发。本项目不宣称跨所有上游的严格 exactly-once。
- 生产环境缺少推送配置会使 Scheduler 启动失败；开发模拟需明确 `PUSH_MOCK=true`，生产不能模拟成功。
- 管理员总览显示三类订阅规模、答题趋势、热门题库、任务状态、最近失败和答题补拉状态；不会展示卡片正文或密钥。
- 答题补拉每分钟执行，持久化递增游标，每轮最多 5000 条。接口回调与补拉共用幂等落库逻辑。

## 常用命令

```bash
docker compose ps
docker compose logs -f app
docker compose logs -f scheduler
docker compose restart app scheduler
docker compose down
```

删除整个数据库卷：

```bash
docker compose down -v
```
