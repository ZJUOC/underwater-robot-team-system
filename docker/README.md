# 容器部署说明

根目录的 `docker-compose.yml` 启动 PostgreSQL、FastAPI 与 Next.js。Web 和 API 的镜像定义分别位于对应应用目录，便于独立构建与部署。

API 容器启动时会先执行 `alembic upgrade head`。生产环境部署前需替换数据库密码、`AUTH_SECRET` 和演示管理员密码。
