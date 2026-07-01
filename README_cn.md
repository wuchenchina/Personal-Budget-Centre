# BudgetCentre

[English](README.md) | [简体中文](README_cn.md)

BudgetCentre 是一个个人与共享预算工作区，使用 React、TypeScript、Ant Design、Go API 和 .NET PDF renderer 构建。它支持预算项目、工作区权限、通行密钥、SSO、参考汇率、记账流水和 PDF 导出。

## 技术栈

- 前端：Vite、React、TypeScript、Ant Design
- 后端：Go HTTP API
- PDF 渲染：.NET worker
- 数据库：MySQL，由 `code/database` 中的 SQL 初始化和迁移
- 运行环境：Docker Compose，包含 Nginx、Go API 和 PDF renderer 容器

## 目录结构

```text
.
  code/
    frontend/             Vite + React 应用
    backend/              Go API
    database/             schema、seed、view 和 migration SQL
    deploy/docker/        Docker 中的 Nginx 配置
    font/                 本地 PDF 字体资源，除 README.md 外默认忽略
    pdf-renderer-dotnet/  .NET PDF renderer worker
  local-only/             已忽略的本地导入、旧代码、私有部署配置
  Dockerfile
  docker-compose.yaml
  deploy.example.sh       公开部署模板
  .env.example            应用环境变量模板
```

## 本地开发

从模板创建环境文件：

```bash
cp .env.example .env
```

安装并构建前端：

```bash
cd code/frontend
yarn install --frozen-lockfile
yarn build
```

运行后端测试：

```bash
cd code/backend
go test ./...
```

构建 PDF renderer：

```bash
dotnet build code/pdf-renderer-dotnet/BudgetCentre.PdfRenderer/BudgetCentre.PdfRenderer.csproj
```

本地运行 API：

```bash
cd code/backend
go run ./cmd/api
```

第一个成功注册的用户会成为管理员。如果已有数据库中没有管理员，可以手动将 `users.is_admin` 设置为 `1`。

## 配置

运行时配置来自 `.env`。真实密钥不要提交到 git。

重要配置：

- `APP_KEY`：安全 token 和 SSO 流程必需。
- `APP_URL`、`API_URL`：前端和 API 的公网访问地址。
- `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER`、`DB_PASSWORD`：MySQL 连接信息。
- `WEBAUTHN_RP_ID`、`WEBAUTHN_ORIGIN`：必须与部署域名匹配。
- `CASDOOR_*`：可选 Axchen/Casdoor SSO 配置。
- `LINUX_DO_*`：可选 Linux Do OAuth/OIDC SSO 配置。所有 SSO provider
  共用 `/api/callback` 回调地址；请将各 provider 的 redirect URI 设置为
  你的公开 API 来源加 `/api/callback`。
- `SMTP_*`：可选邮件配置。
- `WEB_BIND`：web 容器绑定地址，默认 `127.0.0.1:18080`。
- `BANK_REFERENCE_RATES_URL`：可选私有参考汇率接口。开源或默认部署可留空。
- `PDF_RENDERER_*`、`PDF_EXPORT_*`：PDF worker 并发和导出清理配置。

## PDF 字体

PDF 导出需要本地字体文件放在 `code/font`。字体二进制文件默认忽略，因为很多系统字体不可再分发。当前主题需要的文件名见 `code/font/README.md`。

.NET PDF renderer 编译时不会把字体打进应用二进制文件。Docker Compose 会把
`./code/font` 挂载到 renderer 容器中的 `/app/font:ro`，并通过 `FONT_DIR`
指向该目录。运行 `docker compose up -d` 前，请确认服务器上的 `code/font`
已经有完整字体文件。

## Docker

构建并启动应用：

```bash
docker compose build
docker compose up -d
```

web 服务绑定到 `WEB_BIND`，默认：

```text
127.0.0.1:18080
```

API 生成文件、临时文件和日志保存到：

```text
storage/exports
storage/tmp
storage/logs
```

## 数据库

MySQL 预期运行在 Docker 外部。Go API 在启动时执行安全自检：

- 空数据库：按当前干净 schema 执行 `code/database/*.sql`。
- 已有数据库：创建或更新 `schema_migrations`，兼容已知的 1.0 开源前内部 migration 文件名/checksum 变更，然后只执行 pending migration。
- 旧 provider metadata 会由 migration 中性化；真实 provider URL 应只存在私有环境变量中。

应用不提供破坏性的 reset/drop/truncate 流程。

## 部署

`deploy.example.sh` 是公开模板。复制为私有脚本：

```bash
cp deploy.example.sh deploy.local.sh
chmod +x deploy.local.sh
```

你可以编辑 `deploy.local.sh`，也可以在运行前 export 变量，或者把私有值放入已忽略的文件：

```bash
mkdir -p local-only
$EDITOR local-only/deploy.local.env
```

示例 `local-only/deploy.local.env`：

```bash
SERVER_USER="${SERVER_USER:-root}"
SERVER_IP="${SERVER_IP:-203.0.113.10}"
SERVER_PORT="${SERVER_PORT:-22}"
SERVER_SSH_KEY="${SERVER_SSH_KEY:-/path/to/id_ed25519}"
REMOTE_PATH="${REMOTE_PATH:-/opt/budgetcentre}"
DOMAIN="${DOMAIN:-budget.example.com}"

DB_HOST="${DB_HOST:-172.17.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-budgetcentre}"
DB_USER="${DB_USER:-budgetcentre}"
DB_PASSWORD="${DB_PASSWORD:-change-me}"
APP_KEY="${APP_KEY:-change-me-long-random-secret}"

CASDOOR_SERVER_URL="${CASDOOR_SERVER_URL:-}"
CASDOOR_DISPLAY_NAME="${CASDOOR_DISPLAY_NAME:-Axchen SSO}"
CASDOOR_CLIENT_ID="${CASDOOR_CLIENT_ID:-}"
CASDOOR_REDIRECT_URI="${CASDOOR_REDIRECT_URI:-${API_URL%/}/api/callback}"
CASDOOR_CLIENT_SECRET="${CASDOOR_CLIENT_SECRET:-}"
LINUX_DO_CLIENT_ID="${LINUX_DO_CLIENT_ID:-}"
LINUX_DO_CLIENT_SECRET="${LINUX_DO_CLIENT_SECRET:-}"
SMTP_HOST="${SMTP_HOST:-}"
SMTP_USERNAME="${SMTP_USERNAME:-}"
SMTP_PASSWORD="${SMTP_PASSWORD:-}"

BUILD_PROXY="${BUILD_PROXY:-}"
```

可选构建代理：

```bash
BUILD_PROXY=http://10.0.0.1:7890 ./deploy.local.sh
```

该代理会传给前端、Go API 和 .NET PDF renderer 的 Docker build。renderer
在 Docker build 中执行 `dotnet restore` 下载 NuGet 包；第一次构建可能仍会
花一些时间，但 `.csproj` 不变时后续构建会复用 Docker layer cache。

部署脚本会：

- 执行前端 `yarn build`
- 将前端产物复制到 `build/deploy/frontend`
- 执行 `go test ./...`
- 构建 `.NET PDF renderer`
- 交叉编译 Go API 到 `build/deploy/backend/budgetcentre-api`
- 只上传 release allowlist
- 写入远端 `.env`
- 使用 `rsync -avz --progress --itemize-changes` 显示上传进度和变更文件
- 清理远端 release 目录中的旧本地/测试资源，例如旧 PHP 源码、PDF 视觉测试输出、preview-check 目录、dump 和 local-only 文件

部署脚本不会启动 Docker、重启服务或修改数据库。上传后，在服务器执行：

```bash
cd /path/to/budgetcentre
docker compose build
docker compose up -d
```

`docker compose up -d` 后，Go API 启动流程会执行数据库 bootstrap 和 pending migrations。部署脚本刻意不执行 SQL。

## 本地专用数据

`local-only/` 用于保存导入 dump、旧代码快照、服务器测试资源和私有部署 env 文件。该目录会被 git 忽略、从 Docker build context 排除，也不会被 rsync 部署上传。

运行时和生成文件保存在 `storage/`，同样默认忽略，部署脚本不会上传。

## 验证

发布或部署前建议运行：

```bash
cd code/backend && go test ./...
cd ../../code/frontend && yarn build
cd ../.. && dotnet build code/pdf-renderer-dotnet/BudgetCentre.PdfRenderer/BudgetCentre.PdfRenderer.csproj
bash -n deploy.local.sh deploy.example.sh
```

涉及数据库的版本，还应测试空库和旧库：

- 空数据库可成功初始化。
- 已有数据库可迁移到最新版本。
- 用户、工作区、预算、记账等核心资料行数不减少。
- 公开产物不包含私有 provider URL 或部署密钥。

## Git 规范

不要提交：

- `.env*` 文件，除了 `.env.example`
- `deploy.local.sh` 或其他私有部署脚本
- `local-only/`
- `BudgetCentre_old/`、`template/`、`parsed_templates/`
- `docs/` 和 AI/agent 工作文件
- `build/`、`dist/`、`node_modules/`、`vendor/`、`storage/`
- `code/font` 中的本地字体二进制文件
- `__pycache__`、日志、系统或编辑器元数据

## 鸣谢

[Linux Do](https://linux.do/)