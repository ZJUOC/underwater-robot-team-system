"use client";

import Link from "next/link";
import {
  ArrowRight, Brain, CheckCircle, File as FileIcon, Files, MagnifyingGlass,
  Plus, Sparkle, UploadSimple, Warning, X,
} from "@phosphor-icons/react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api, apiForm } from "../lib/api";
import type { ApplicationSummary, MaterialAnalysis } from "../types";
import { EmptyState, ErrorState, LoadingState } from "../components/States";
import { PersonalityTags } from "../components/PersonalityTags";

type Modal = "create" | "assistant" | null;

export default function ApplicationsPage() {
  const [rows, setRows] = useState<ApplicationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [quality, setQuality] = useState<"all" | "ready" | "needs_review">("all");
  const [modal, setModal] = useState<Modal>(null);
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [analysis, setAnalysis] = useState<MaterialAnalysis | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api<ApplicationSummary[]>("/api/applications")
      .then((data) => setRows([...data].sort((left, right) => {
        if (left.source_type === "demo") return 1;
        if (right.source_type === "demo") return -1;
        return new Date(right.applied_at).getTime() - new Date(left.applied_at).getTime();
      })))
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const filtered = useMemo(() => rows.filter((row) => {
    const personalityTerms = row.personality_profile?.tags?.flatMap((tag) => [tag.label, tag.dimension]) ?? [];
    const matchesQuery = [row.name, row.student_id, row.major, row.desired_department, ...row.interests, ...personalityTerms]
      .join(" ").toLowerCase().includes(query.toLowerCase());
    const matchesQuality = quality === "all" || row.data_quality === quality;
    return matchesQuery && matchesQuality;
  }), [quality, query, rows]);
  const reviewCount = rows.filter((row) => row.data_quality === "needs_review").length;
  const submissionCount = rows.reduce((sum, row) => sum + row.submission_count, 0);

  async function createApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const interests = String(form.get("interests") ?? "").split(/[、,，]/).map((value) => value.trim()).filter(Boolean);
      await api<ApplicationSummary>("/api/applications", { method: "POST", body: JSON.stringify({
        name: form.get("name"), student_id: form.get("student_id"), major: form.get("major"),
        grade: form.get("grade"), phone: form.get("phone"), desired_department: form.get("desired_department"),
        interests, weekly_commitment: form.get("weekly_commitment"), motivation: form.get("motivation"),
        prior_experience: form.get("prior_experience"), recruitment_cycle: "2026 秋季纳新",
      }) });
      setModal(null);
      load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "建档失败");
    } finally { setSaving(false); }
  }

  async function analyzeMaterials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (files.length === 0) return;
    setSaving(true);
    setAnalysis(null);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = new FormData();
    files.forEach((file) => payload.append("files", file));
    payload.append("notes", String(form.get("notes") ?? ""));
    const memberId = String(form.get("member_id") ?? "");
    if (memberId) payload.append("member_id", memberId);
    try {
      setAnalysis(await apiForm<MaterialAnalysis>("/api/material-analyses", payload));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "资料分析失败");
    } finally { setSaving(false); }
  }

  return <div className="page application-page">
    <div className="page-heading">
      <div><p className="eyebrow">Recruitment Archive</p><h1>纳新档案</h1><p>每位报名者一个档案，问卷、资料、面试和分析结果沿同一人员身份关联。</p></div>
      <div className="heading-actions">
        <button className="button secondary" type="button" onClick={() => setModal("create")}><Plus size={16} /> 新建档案</button>
        <button className="button primary" type="button" onClick={() => { setAnalysis(null); setFiles([]); setModal("assistant"); }}><Sparkle size={17} weight="fill" /> 资料分析助手</button>
      </div>
    </div>

    <section className="archive-summary" aria-label="纳新档案概况">
      <div><span>个人档案</span><strong>{rows.length}</strong><small>按身份去重后的档案</small></div>
      <div><span>原始提交</span><strong>{submissionCount}</strong><small>重复提交保留在同一档案</small></div>
      <div className={reviewCount ? "attention" : ""}><span>待核对</span><strong>{reviewCount}</strong><small>缺字段、重复或测试记录</small></div>
    </section>

    <div className="archive-toolbar">
      <label className="table-search"><MagnifyingGlass size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名、学号、专业、志愿或人格标签" /></label>
      <div className="segmented-control" aria-label="数据质量筛选">
        <button className={quality === "all" ? "active" : ""} type="button" onClick={() => setQuality("all")}>全部</button>
        <button className={quality === "ready" ? "active" : ""} type="button" onClick={() => setQuality("ready")}>资料完整</button>
        <button className={quality === "needs_review" ? "active" : ""} type="button" onClick={() => setQuality("needs_review")}>待核对</button>
      </div>
      <span className="result-count">{filtered.length} 份档案</span>
    </div>

    {error && <ErrorState message={error} retry={load} />}
    {loading ? <LoadingState rows={7} /> : filtered.length === 0 ? <EmptyState title="没有匹配的纳新档案" description="调整搜索条件，或为新的报名者建立档案。" /> : <section className="archive-directory">
      <div className="archive-directory-head"><span>报名者</span><span>专业与志愿</span><span>人格标签</span><span>资料状态</span><span className="sr-only">打开</span></div>
      {filtered.map((row) => <Link className="archive-record" href={`/applications/${row.id}`} key={row.id}>
        <div className="archive-person"><span className="member-avatar">{row.name.slice(0, 1)}</span><span><strong>{row.name}</strong><small>{row.student_id}</small></span></div>
        <div><strong>{row.major || "专业待补充"}</strong><small>{row.desired_department || "志愿待确认"}</small></div>
        <PersonalityTags profile={row.personality_profile} empty="材料不足" />
        <div className="archive-state"><span className={`status-chip ${row.data_quality === "needs_review" ? "pending" : "active"}`}>{row.data_quality === "needs_review" ? "待核对" : row.data_quality === "demo" ? "演示档案" : "资料已归档"}</span><small>{row.submission_count} 份原始提交</small></div>
        <ArrowRight size={18} />
      </Link>)}
    </section>}

    {modal === "create" && <Dialog title="新建纳新档案" description="建立报名者身份后，后续资料与面试都会挂到这份档案。" close={() => setModal(null)}>
      <form className="form-grid" onSubmit={createApplication}>
        <label><span>姓名</span><input name="name" required /></label><label><span>学号</span><input name="student_id" required /></label>
        <label><span>专业</span><input name="major" /></label><label><span>年级</span><input name="grade" defaultValue="2026" /></label>
        <label><span>手机号</span><input name="phone" inputMode="tel" /></label><label><span>每周投入</span><select name="weekly_commitment"><option>1-2h</option><option>3-5h</option><option>5h以上</option></select></label>
        <label className="full"><span>部门志愿</span><input name="desired_department" /></label>
        <label className="full"><span>技术方向</span><input name="interests" placeholder="智能硬件、具身智能、机械设计" /><small>作为原始报名资料保存，不直接当作人格结论</small></label>
        <label className="full"><span>相关基础</span><textarea name="prior_experience" /></label>
        <label className="full"><span>加入原因</span><textarea name="motivation" /></label>
        <FormActions saving={saving} close={() => setModal(null)} label="创建档案" />
      </form>
    </Dialog>}

    {modal === "assistant" && <Dialog wide title="资料分析助手" description="一次上传多种资料。AI 会跨文件整理事实、冲突、缺口和建议问题。" close={() => setModal(null)}>
      <form className="assistant-layout" onSubmit={analyzeMaterials}>
        <div className="assistant-inputs">
          <label className="upload-zone">
            <input type="file" multiple accept=".xlsx,.xls,.csv,.pdf,.docx,.txt,.md,.json" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
            <UploadSimple size={26} /><strong>选择一个资料包</strong><span>问卷、表格、简历、文字记录和 PDF 可以混合上传</span>
          </label>
          {files.length > 0 && <div className="selected-files">{files.map((file) => <div key={`${file.name}-${file.size}`}><FileIcon size={16} /><span>{file.name}</span><small>{formatBytes(file.size)}</small></div>)}</div>}
          <label className="assistant-field"><span>关联到报名者（可选）</span><select name="member_id"><option value="">先只分析资料包</option>{rows.map((row) => <option value={row.member_id} key={row.member_id}>{row.name} / {row.student_id}</option>)}</select></label>
          <label className="assistant-field"><span>补充背景</span><textarea name="notes" placeholder="例如：这些资料可能来自同一位报名者，请重点判断技术基础和信息冲突。" /></label>
          <button className="button primary assistant-submit" type="submit" disabled={saving || files.length === 0}><Brain size={18} />{saving ? "正在整理资料" : "开始 AI 分析"}</button>
        </div>
        <div className="assistant-output" aria-live="polite">
          {!analysis ? <div className="assistant-empty"><Files size={34} /><strong>分析结果会出现在这里</strong><p>助手不会直接修改个人档案。所有抽取事实都需要人工确认后再使用。</p></div> : <AnalysisResult analysis={analysis} />}
        </div>
      </form>
    </Dialog>}
  </div>;
}

function AnalysisResult({ analysis }: { analysis: MaterialAnalysis }) {
  return <div className="analysis-sheet">
    <div className="analysis-sheet-heading"><span className="status-chip pending">待确认</span><small>{analysis.file_names.length} 份资料</small></div>
    <h3>资料摘要</h3><p>{analysis.summary}</p>
    <h3>可确认事实</h3><div className="fact-list">{analysis.extracted_facts.map((fact, index) => <div key={`${fact.label}-${index}`}><CheckCircle size={17} /><div><strong>{fact.label}</strong><p>{fact.value}</p><small>{fact.source} / 可信度 {Math.round(fact.confidence * 100)}%</small></div></div>)}</div>
    <h3>信息缺口</h3><div className="uncertainty-list">{analysis.uncertainties.map((item) => <p key={item}><Warning size={16} />{item}</p>)}</div>
    <h3>建议面试问题</h3><ol className="question-suggestions">{analysis.suggested_questions.map((item) => <li key={item}>{item}</li>)}</ol>
  </div>;
}

function Dialog({ title, description, close, children, wide = false }: { title: string; description: string; close: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={close}><div className={`modal ${wide ? "assistant-modal" : ""}`} role="dialog" aria-modal="true" aria-labelledby="application-dialog-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><h2 id="application-dialog-title">{title}</h2><p>{description}</p></div><button className="icon-button" type="button" onClick={close} aria-label="关闭"><X size={18} /></button></div>{children}</div></div>;
}

function FormActions({ saving, close, label }: { saving: boolean; close: () => void; label: string }) {
  return <div className="form-actions full"><button className="button secondary" type="button" onClick={close}>取消</button><button className="button primary" type="submit" disabled={saving}>{saving ? "正在保存" : label}</button></div>;
}

function formatBytes(size: number) { return size > 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`; }
