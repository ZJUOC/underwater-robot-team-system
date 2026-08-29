# 水下机器人团队成员画像与协作管理系统

一个同时服务纳新与社团成员成长的管理系统。当前主线是 `杂乱报名材料 -> 个人纳新档案 -> 面试 -> Evidence -> 成员画像`，每条信息都能回到具体的人和原始来源。

当前仓库实现 Phase 1 MVP：纳新个人档案、可解释人格标签、正式成员中心、面试、结构化逐字稿、资料分析助手、Mock AI 证据分析、动态画像与证据审核。工作台暂不作为主入口，后续阶段再开发。

## 目录

```text
apps/web        Next.js 管理端
apps/api        FastAPI 服务、SQLAlchemy 模型与 Mock Provider
docs            架构、ER 设计和开发拆分
data            私有数据放置说明；真实问卷只在本地保留
docker          容器部署说明
```

## 本地运行

### 1. API

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

API 文档位于 `http://localhost:8000/docs`。本地存在私有 `seed_questionnaire.json` 时，首次启动会导入真实问卷；仓库默认使用不含个人信息的合成演示数据。重复提交和缺失身份的数据不会丢弃，而会保留在对应档案的原始资料中并标记待复核。系统另写入“张三”演示档案及其 Mock 面试数据。

本地演示账号：`admin` / `robot2026`。生产环境必须更换账号、密码与 `AUTH_SECRET`。

### 2. Web

```bash
cd apps/web
npm install
cp .env.example .env.local
npm run dev
```

打开 `http://localhost:3000`。默认 API 地址为 `http://localhost:8000`。

## Docker Compose

```bash
docker compose up --build
```

容器环境使用 PostgreSQL；本地直接运行 API 时默认使用 SQLite，方便快速体验。

## Phase 1 验收路径

1. 进入“纳新档案”，搜索并打开任一报名者，检查报名、面试、AI 资料分析与证据是否都关联到同一人。
2. 点击“资料分析助手”，上传 XLSX、CSV、PDF、DOCX、TXT、Markdown 或 JSON 等材料，并选择要关联的纳新档案。系统会直接抽取 XLSX 单元格、DOCX 正文和文本类文件；扫描版 PDF 与旧版 XLS 会明确提示补充解析。
3. 进入“面试管理”，直接从纳新档案选择候选人，不需要重新导入名单。
4. 打开 Mock 面试，检查候选人、面试官与问题的逐字稿映射，然后执行“分析面试”。
5. 回到该候选人的纳新档案查看新 Evidence 与画像更新。
6. 在“证据审核”接受或拒绝 AI 证据，原始证据始终保留。
7. 进入“成员中心”，确认这里仅展示已经加入社团的正式成员。

也可以从“面试管理”新建场次，添加问题、录入 Utterance，并人工修正 Speaker 映射。

## 人格标签方法

人格标签采用 Big Five 行为维度的团队协作化表达：探索开放、行动落实、主动表达、协作共情和压力稳定。开发版引擎只从报名动机、相关经历和候选人面试表达中识别明确语言信号，输出信号强度、可信度和原文依据；材料不足时显示“待分析”，不会自动补齐标签。

这些信号不是常模百分位或心理诊断。人格标签只用于帮助面试官理解沟通与协作方式，不得单独用于筛选、排序或决定录取。技术兴趣仍作为独立的原始报名字段保存。

## 安全说明

- 原始问卷包含手机号与 IP；列表不展示敏感字段，详情页对手机号脱敏，原始提交仅通过已认证接口读取。
- 录音、AI 分析前保留三个独立同意字段。
- Evidence 审核使用状态变更，不执行物理删除。
- 生产环境应替换默认密钥、启用对象存储私有桶、部署数据库备份和访问审计。
