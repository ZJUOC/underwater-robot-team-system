# 整体技术架构

## 设计目标

系统的核心不是汇总分数，而是保存每一次判断的来源、强度、可信度、审核状态与变化历史。画像是 Evidence 的当前聚合视图，不是原始事实。

## 运行架构

```text
Next.js Web
  | REST / JSON
FastAPI
  |-- RBAC / Audit
  |-- Application Archive Service
  |-- Member Service
  |-- Interview Service
  |-- Material Analysis Service
  |-- Personality Signal Engine
  |     `-- Big Five 固定维度 / 可复现语言信号 / 原文依据
  |-- Evidence Engine
  |-- AIProvider
  |     |-- MockAIProvider (Phase 1)
  |     `-- OpenAICompatibleProvider (配置接口已预留)
  |-- MeetingProvider
  |     |-- MockMeetingProvider (Phase 1)
  |     `-- TencentMeetingProvider (Phase 3)
  `-- SQLAlchemy
        |-- SQLite (本地快速启动)
        `-- PostgreSQL (Docker / 生产)
```

## 数据处理链

```text
Raw Questionnaire Submission / Uploaded Material
  -> ApplicationArchive（一人一档，保留全部原始提交）
  -> Interview / MaterialAnalysis（关联同一报名者）
Utterance / ObserverRecord / Submission
  -> ActivityEvent（标准化活动）
  -> Evidence（带来源、强度、可信度与审核状态）
  -> MemberTag（按可配置策略聚合）
  -> MemberProfile（当前可解释画像）
  -> Recommendation（组队或培养建议）
```

资料分析助手先输出摘要、可确认事实、信息缺口和建议面试问题；面试 AI Provider 只能创建 `pending` Evidence。人工审核将状态改为 `accepted`、`rejected` 或 `modified`；任何状态变更都不删除原始 AI 输出。

人格分析不让通用 LLM 自由生成类型。系统先用固定 Big Five 维度识别可复现的语言信号，再保存强度、置信度和原文片段；未来 LLM 只负责在这些白名单信号上生成解释。缺乏证据时返回 `insufficient_data`，人格结果不得参与自动录取。

## 权限边界

| 能力 | Super Admin | Department Admin | Interviewer | Observer | Project Leader | Member |
| --- | --- | --- | --- | --- | --- | --- |
| 查看全部成员 | 是 | 本部门 | 面试候选人 | 观察对象 | 项目成员 | 本人 |
| 录入逐字稿 | 是 | 是 | 是 | 否 | 否 | 否 |
| 审核 Evidence | 是 | 本部门 | 面试来源 | 观察来源 | 项目来源 | 否 |
| 查看敏感原始数据 | 是 | 授权范围 | 面试范围 | 否 | 项目范围 | 本人 |

Phase 1 已实现带过期时间和 HMAC 签名的本地访问令牌，并在 API 中统一阻止未认证请求。角色和部门范围写入用户模型与令牌；生产部署前仍需接入真实身份源并把资源级权限应用到每个查询。

## 可演进边界

- `EvidenceWeightPolicy` 独立于业务实体，权重可配置且可版本化。
- `AIProvider` 与 `MeetingProvider` 使用协议接口，业务层不依赖具体厂商。
- 对象存储通过 Storage Provider 接口扩展到 COS、OSS 或 S3。
- 所有核心实体包含时间戳，评价型数据使用软删除或状态流转。
