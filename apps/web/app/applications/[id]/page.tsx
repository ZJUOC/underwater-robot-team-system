"use client";

import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Brain, CalendarBlank, CheckCircle, Clock,
  FileText, IdentificationCard, Phone, ShieldCheck, Warning,
} from "@phosphor-icons/react";
import { use, useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { ApplicationDetail } from "../../types";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { PersonalityProfilePanel } from "../../components/PersonalityTags";

export default function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<ApplicationDetail | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setError("");
    api<ApplicationDetail>(`/api/applications/${id}`).then(setData).catch((reason) => setError(reason.message));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <div className="page"><ErrorState message={error} retry={load} /></div>;
  if (!data) return <div className="page"><LoadingState rows={7} /></div>;
  const submissions = data.raw_answers.submissions ?? [];

  return <div className="page application-detail-page">
    <Link href="/applications" className="back-link"><ArrowLeft size={16} /> 返回纳新档案</Link>
    <header className="applicant-header">
      <div className="applicant-identity"><span className="profile-avatar">{data.name.slice(0, 1)}</span><div><div className="profile-name-line"><h1>{data.name}</h1><span className="status-chip active">{data.status}</span></div><p>{data.major || "专业待补充"} / {data.student_id}</p></div></div>
      <div className="applicant-header-meta">
        <div><span>档案编号</span><strong>{data.application_no}</strong></div>
        <div><span>部门志愿</span><strong>{data.desired_department || "待确认"}</strong></div>
        <div><span>联系方式</span><strong>{data.phone_masked}</strong></div>
      </div>
    </header>

    {data.data_quality === "needs_review" && <div className="quality-alert"><Warning size={20} /><div><strong>这份档案需要人工核对</strong><p>原始提交存在缺字段或重复记录。系统保留了所有来源，没有自动猜测缺失信息。</p></div></div>}

    <div className="application-detail-layout">
      <main className="application-detail-main">
        <PersonalityProfilePanel profile={data.personality_profile} />
        <section className="panel application-info-panel">
          <div className="panel-heading"><div><h2>报名信息</h2><p>直接来自问卷或管理员补录，属于自我陈述。</p></div><span className="method-note"><ShieldCheck size={16} /> 原始来源可追溯</span></div>
          <div className="application-info-grid">
            <div><span>加入原因</span><p>{data.motivation || "未填写"}</p></div>
            <div><span>相关基础</span><p>{data.prior_experience || "未填写"}</p></div>
            <div><span>每周投入</span><strong><Clock size={16} /> {data.available_time || "未填写"}</strong></div>
            <div><span>技术方向</span><div className="tags">{data.interests.length ? data.interests.map((item) => <span key={item}>{item}</span>) : <small>未填写</small>}</div></div>
          </div>
        </section>

        <section className="panel linked-section">
          <div className="panel-heading"><div><h2>关联面试</h2><p>面试场次、逐字稿和分析结果都通过同一人员身份关联。</p></div><Link href="/interviews" className="text-link">进入面试管理</Link></div>
          {data.interviews.length === 0 ? <EmptyState title="还没有面试记录" description="在面试管理中创建场次时选择这位报名者。" /> : <div className="linked-interviews">{data.interviews.map((interview) => <Link href={`/interviews/${interview.id}`} key={interview.id}><span className="record-icon"><IdentificationCard size={18} /></span><div><strong>{interview.title}</strong><small>{new Date(interview.scheduled_at).toLocaleString("zh-CN")} / {interview.utterance_count} 条逐字稿</small></div><span className={`status-chip ${interview.status === "analyzed" ? "active" : "pending"}`}>{interview.status === "analyzed" ? "已分析" : "待分析"}</span><ArrowRight size={17} /></Link>)}</div>}
        </section>

        <section className="panel linked-section">
          <div className="panel-heading"><div><h2>AI 资料分析</h2><p>来自资料分析助手，结果先保留为待确认，不直接覆盖报名信息。</p></div><Link href="/applications" className="text-link">分析新资料</Link></div>
          {data.material_analyses.length === 0 ? <EmptyState title="暂无资料分析" description="可上传简历、表格、PDF 和文字记录，由助手跨文件整理。" /> : <div className="material-analysis-list">{data.material_analyses.map((analysis) => <article key={analysis.id}>
            <div className="material-analysis-title"><span className="record-icon"><Brain size={18} /></span><div><strong>{analysis.title}</strong><small>{analysis.file_names.join("、")}</small></div><span className="status-chip pending">待确认</span></div>
            <p>{analysis.summary}</p>
            <div className="analysis-facts-inline">{analysis.extracted_facts.map((fact) => <span key={fact.label}><CheckCircle size={14} />{fact.label}</span>)}</div>
          </article>)}</div>}
        </section>

        <section className="panel linked-section">
          <div className="panel-heading"><div><h2>画像与证据</h2><p>只有面试或后续活动产生的可追溯证据，才进入能力画像。</p></div><Link href="/evidence" className="text-link">审核 Evidence</Link></div>
          {data.tags.length === 0 ? <EmptyState title="还没有能力画像" description="完成一次面试分析和 Evidence 审核后，这里会显示能力维度。" /> : <div className="compact-capabilities">{data.tags.map((tag) => <div key={tag.id}><strong>{tag.dimension}</strong><span>{tag.score.toFixed(1)}</span><small>{tag.evidence_count} 条证据 / 可信度 {Math.round(tag.confidence * 100)}%</small></div>)}</div>}
        </section>
      </main>

      <aside className="application-detail-aside">
        <section className="panel archive-index-panel"><h2>档案索引</h2>
          <div><span><CalendarBlank size={15} /> 报名时间</span><strong>{new Date(data.applied_at).toLocaleString("zh-CN")}</strong></div>
          <div><span><FileText size={15} /> 原始来源</span><strong>{data.source_name}</strong></div>
          <div><span><Phone size={15} /> 原始提交</span><strong>{data.submission_count} 份</strong></div>
          <div><span>档案完整度</span><strong>{Math.round(data.profile_completion * 100)}%</strong></div>
        </section>
        <section className="panel archive-source-panel"><h2>原始提交</h2><p>原文只读保留，重复提交不会覆盖。</p>
          {submissions.length === 0 ? <small>这是一份人工或演示档案，没有原始问卷行。</small> : submissions.map((submission, index) => <details key={String(submission["序号"] ?? index)}><summary>提交 #{String(submission["序号"] ?? index + 1)}</summary><dl>
            <div><dt>提交时间</dt><dd>{String(submission["提交答卷时间"] ?? "未记录")}</dd></div>
            <div><dt>原始身份字段</dt><dd>{String(submission["1、您的 姓名 学号 是？"] ?? "未填写")}</dd></div>
            <div><dt>QQ群状态</dt><dd>{String(submission["9、您有没有加入我们的纳新QQ群？"] ?? "未填写")}</dd></div>
          </dl></details>)}
        </section>
      </aside>
    </div>
  </div>;
}
