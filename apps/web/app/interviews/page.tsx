"use client";

import Link from "next/link";
import { ArrowRight, CalendarBlank, CheckCircle, Microphone, Plus, ShieldWarning, X } from "@phosphor-icons/react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { ApplicationSummary, InterviewSummary } from "../types";
import { ErrorState, LoadingState } from "../components/States";

export default function InterviewsPage() {
  const [rows, setRows] = useState<InterviewSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [applications, setApplications] = useState<ApplicationSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => { setLoading(true); setError(""); api<InterviewSummary[]>("/api/interviews").then(setRows).catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  useEffect(() => { load(); api<ApplicationSummary[]>("/api/applications").then((data) => setApplications([...data].sort((left, right) => left.source_type === "demo" ? 1 : right.source_type === "demo" ? -1 : 0))).catch(() => undefined); }, [load]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api<InterviewSummary>("/api/interviews", { method: "POST", body: JSON.stringify({
        member_id: Number(form.get("member_id")), title: form.get("title"), meeting_provider: "mock",
        informed_consent: form.get("informed_consent") === "on",
        recording_consent: form.get("recording_consent") === "on",
        ai_consent: form.get("ai_consent") === "on",
      }) });
      setOpen(false); load();
    } catch (e) { setError(e instanceof Error ? e.message : "创建失败"); }
    finally { setSaving(false); }
  }
  return <div className="page">
    <div className="page-heading"><div><p className="eyebrow">Interview System</p><h1>面试管理</h1><p>每个场次直接关联纳新个人档案，面试资料不再作为独立名单重复导入。</p></div><button className="button primary" type="button" onClick={() => setOpen(true)}><Plus size={16} /> 创建面试</button></div>
    <div className="consent-banner"><ShieldWarning size={22} /><div><strong>分析前必须完成候选人授权</strong><p>知情、同意录音、同意 AI 辅助分析三个选项独立保存。</p></div></div>
    {error && <ErrorState message={error} retry={load} />}{loading ? <LoadingState rows={4} /> : <div className="interview-grid">{rows.map(row => <Link href={`/interviews/${row.id}`} className="interview-card" key={row.id}>
      <div className="interview-card-top"><span className="status-chip active">{row.status === "analyzed" ? "已分析" : "待分析"}</span><span className="provider-label"><Microphone size={14} /> {row.meeting_provider}</span></div>
      <h2>{row.title}</h2><p>{row.member_name} / 纳新档案 #{row.application_id}</p>
      <div className="interview-card-meta"><span><CalendarBlank size={16} /> {new Date(row.scheduled_at).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })}</span><span><CheckCircle size={16} /> {row.consent_complete ? "授权完整" : "授权缺失"}</span></div>
      <div className="interview-card-footer"><span>{row.utterance_count} 条 Utterance</span><strong>打开面试台 <ArrowRight size={16} /></strong></div>
    </Link>)}</div>}
    {open && <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}><div className="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="new-interview-title" onMouseDown={e => e.stopPropagation()}>
      <div className="modal-heading"><div><h2 id="new-interview-title">创建面试</h2><p>先建立场次，随后录入问题与逐字稿。</p></div><button className="icon-button" type="button" onClick={() => setOpen(false)}><X size={18} /></button></div>
      <form onSubmit={submit} className="form-grid">
        <label className="full"><span>纳新档案</span><select name="member_id" required>{applications.map(application => <option value={application.member_id} key={application.id}>{application.name} / {application.student_id}</option>)}</select><small>面试会自动回写到对应个人档案</small></label>
        <label className="full"><span>面试名称</span><input name="title" defaultValue="2026 纳新第一轮面试" required /></label>
        <fieldset className="consent-fieldset full"><legend>候选人授权</legend><label><input type="checkbox" name="informed_consent" /> 已知情</label><label><input type="checkbox" name="recording_consent" /> 同意录音</label><label><input type="checkbox" name="ai_consent" /> 同意 AI 辅助分析</label></fieldset>
        <div className="form-actions full"><button className="button secondary" type="button" onClick={() => setOpen(false)}>取消</button><button className="button primary" type="submit" disabled={saving || applications.length === 0}>{saving ? "正在创建" : "创建面试"}</button></div>
      </form>
    </div></div>}
  </div>;
}
