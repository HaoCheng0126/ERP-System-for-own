# Kinko 企业管理系统

一款面向制造业中小企业的 ToB SaaS 产品，专注于生产计件工资管理和客户对账管理。

## 产品功能

### 核心模块
- **基础资料管理**：公司资料、客户资料、产品资料、用户管理
- **计件工资系统**：入库单提交与审核、工资自动计算、工资报表
- **客户对账系统**：送货单管理、对账单自动生成

### 用户角色
- **计件用户（员工）**：提交入库单，查看个人收入
- **管理用户（管理员）**：审核入库单，管理基础资料，生成对账单

## 技术栈

### 前端
- React 18 + TypeScript
- Vite
- Tailwind CSS
- React Router
- TanStack Query
- Lucide Icons

### 后端
- Node.js + Express + TypeScript
- TypeORM
- PostgreSQL
- JWT 认证
- bcrypt 密码加密

## 快速开始

### 前置要求
- Node.js 18+
- Docker & Docker Compose（可选，用于数据库或全栈部署）

### 方式一：本地开发（推荐）

1. 启动数据库（二选一）
   - **使用 Docker**：`docker-compose up -d postgres`
   - **使用本机 PostgreSQL**：确保 PostgreSQL 已安装并创建数据库 `kinko`

2. 配置后端
```bash
cd backend
npm install
cp .env.example .env
# 若用本机数据库，编辑 .env 中的 DB_HOST、DB_PORT、DB_USERNAME、DB_PASSWORD、DB_DATABASE
npm run dev
```

3. 配置前端
```bash
cd frontend
npm install
# 开发时可不配置 .env，默认走 Vite 代理
npm run dev
```

4. 访问
   - 前端：http://localhost:3000
   - 后端 API：http://localhost:3001
   - 默认账号：admin / admin123（管理员）
   - 如需演示公司、员工、客户、产品和客户价格数据，可在后端 `.env` 设置 `ENABLE_DEMO_DATA=true`

### 飞书网页应用接入

- 后端 `.env` 额外配置：
  - `FEISHU_APP_ID`
  - `FEISHU_APP_SECRET`
  - `FEISHU_REDIRECT_URI`
  - `FEISHU_SCOPE`（可选）
- 推荐将 `FEISHU_REDIRECT_URI` 配置为前端登录页地址，例如 `https://your-domain.com/login`
- 登录映射规则：飞书手机号匹配系统 `users.phone`
- 若未匹配到系统账号，飞书登录会被拒绝，原账号密码登录仍可继续使用
- 前端无需额外密钥配置，登录页会通过 `/api/auth/feishu/status` 自动判断是否展示飞书登录入口

### 方式二：Docker Compose 全栈部署

一键启动数据库、后端、前端：

```bash
# 生产部署前请设置环境变量
export JWT_SECRET=your-strong-secret-key

docker-compose up -d
```

访问 http://localhost（端口 80）。前端与 API 同域，`/api` 由 Nginx 代理到后端。

### 生产部署说明

- **JWT_SECRET**：必须在 `.env` 或环境变量中设置强密码，不能使用默认值
- **CORS**：生产环境需配置 `CORS_ORIGIN` 或 `FRONTEND_URL` 限制允许的前端域名
- **数据库迁移**：生产环境使用 `synchronize: false`，部署时自动执行 `npm run migration:run`

## 项目结构

```
Kinko 企业管理系统/
├── backend/              # 后端项目
│   ├── src/
│   │   ├── entities/     # 数据库实体
│   │   ├── migrations/   # 数据库迁移
│   │   ├── controllers/  # 控制器
│   │   ├── routes/       # 路由
│   │   ├── middlewares/  # 中间件
│   │   └── config/       # 配置
│   ├── Dockerfile
│   └── package.json
├── frontend/             # 前端项目
│   ├── src/
│   │   ├── pages/        # 页面
│   │   ├── components/   # 组件
│   │   ├── utils/        # 工具函数
│   │   └── ...
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── .env.example
│   └── package.json
└── docker-compose.yml
```

## 开发计划

详见 [.trae/documents/kinko_implementation_plan.md](.trae/documents/kinko_implementation_plan.md)
