"use client";

import Link from "next/link";
import { ArrowLeft, Brain, CheckCircle, Clock, PencilSimple, Plus, Quotes, ShieldCheck, Warning, X } from "@phosphor-icons/react";
import { FormEvent, use, useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { Evidence, InterviewDetail } from "../../types";
import { ErrorState, LoadingState } from "../../components/States";

export default function InterviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<InterviewDetail | null>(null);
  const [error, setError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<{ message: string; created_evidence: Evidence[] } | null>(null);
  const [modal, setModal] = useState<"question" | "utterance" | "speaker" | null>(null);
  const [selectedSpeaker, setSelectedSpeaker] = useState<InterviewDetail["utterances"][number] | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => { setError(""); api<InterviewDetail>(`/api/interviews/${id}`).then(setData).catch(e => setError(e.message)); }, [id]);
  useEffect(load, [load]);
  async function analyze() {
    setAnalyzing(true); setError("");
    try { const response = await api<{ message: string; created_evidence: Evidence[] }>(`/api/interviews/${id}/analyze`, { method: "POST" }); setResult(response); load(); }
    catch (e) { setError(e instanceof Error ? e.message : "分析失败"); }
    finally { setAnalyzing(false); }
  }
  async function createQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); const form = new FormData(event.currentTarget);
    try { await api(`/api/interviews/${id}/questions`, { method: "POST", body: JSON.stringify({
      title: form.get("title"), content: form.get("content"), category: form.get("category"), difficulty: form.get("difficulty"),
      evaluation_dimensions: splitList(form.get("dimensions")), reference_points: splitList(form.get("points")), follow_up_questions: [],
    }) }); setModal(null); load(); } catch (e) { setError(e instanceof Error ? e.message : "创建问题失败"); } finally { setSaving(false); }
  }
  async function createUtterance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); const form = new FormData(event.currentTarget);
    try { await api(`/api/interviews/${id}/utterances`, { method: "POST", body: JSON.stringify({
      speaker_id: form.get("speaker_id"), speaker_name: form.get("speaker_name"), speaker_role: form.get("speaker_role"),
      start_time: Number(form.get("start_time")), end_time: Number(form.get("end_time")), text: form.get("text"),
      question_id: form.get("question_id") ? Number(form.get("question_id")) : null, confidence: 1,
    }) }); setModal(null); load(); } catch (e) { setError(e instanceof Error ? e.message : "录入逐字稿失败"); } finally { setSaving(false); }
  }
  async function mapSpeaker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedSpeaker) return; setSaving(true); setError(""); const form = new FormData(event.currentTarget);
    try { await api(`/api/interviews/${id}/speakers`, { method: "PATCH", body: JSON.stringify({
      speaker_id: selectedSpeaker.speaker_id, speaker_name: form.get("speaker_name"), speaker_role: form.get("speaker_role"),
    }) }); setModal(null); setSelectedSpeaker(null); load(); } catch (e) { setError(e instanceof Error ? e.message : "修正 Speaker 失败"); } finally { setSaving(false); }
  }
  if (error && !data) return <div className="page"><ErrorState message={error} retry={load} /></div>;
  if (!data) return <div className="page"><LoadingState rows={6} /></div>;
  return <div className="page interview-console">
    <Link href="/interviews" className="back-link"><ArrowLeft size={16} /> 返回面试管理</Link>
    <div className="page-heading console-heading"><div><p className="eyebrow">Mock Meeting / {data.meeting_id}</p><h1>{data.title}</h1><p>{data.member_name} / {new Date(data.scheduled_at).toLocaleString("zh-CN")}</p></div><div className="heading-actions"><button className="button secondary" type="button" onClick={() => setModal("utterance")}><Plus size={16} /> 录入逐字稿</button><button className="button primary analyze-button" type="button" disabled={analyzing || !data.consent_complete} onClick={analyze}><Brain size={18} /> {analyzing ? "正在分析" : data.status === "analyzed" ? "重新分析" : "分析面试"}</button></div></div>
    {error && <div className="inline-error"><Warning size={18} />{error}</div>}
    {result && <div className="analysis-result"><CheckCircle size={22} /><div><strong>{result.message}</strong><p>{result.created_evidence.map(e => e.dimension).join("、") || "未产生重复证据"}</p></div><Link href={`/applications/${data.application_id}`}>查看纳新档案</Link></div>}
    <section className="consent-strip">{[
      ["候选人已知情", data.informed_consent], ["同意录音", data.recording_consent], ["同意 AI 辅助分析", data.ai_consent],
    ].map(([label, checked]) => <div key={String(label)} className={checked ? "checked" : ""}><ShieldCheck size={17} /><span>{label}</span><strong>{checked ? "已确认" : "缺失"}</strong></div>)}</section>
    <div className="console-layout">
      <section className="panel transcript-panel"><div className="panel-heading"><div><h2>结构化逐字稿</h2><p>Speaker 可以人工修正，Utterance 与问题分别保存。</p></div><span>{data.utterance_count} 条</span></div><div className="transcript-list">
        {data.utterances.map(item => <article className={item.speaker_role === "candidate" ? "utterance candidate" : "utterance"} key={item.id}><div className="utterance-meta"><span className="speaker-avatar">{item.speaker_name.slice(0,1)}</span><div><strong>{item.speaker_name}</strong><small>{item.speaker_role === "candidate" ? "候选人" : item.speaker_role === "observer" ? "观察员" : "面试官"} / {item.speaker_id}</small></div><time><Clock size={14} /> {formatTime(item.start_time)} - {formatTime(item.end_time)}</time><button className="speaker-edit" type="button" onClick={() => { setSelectedSpeaker(item); setModal("speaker"); }}><PencilSimple size={14} /> 修正 Speaker</button></div><p>{item.text}</p><div className="utterance-foot"><span>问题 #{item.question_id ?? "未关联"}</span><span>转写可信度 {Math.round(item.confidence * 100)}%</span></div></article>)}
      </div></section>
      <aside className="panel question-panel"><div className="panel-heading"><div><h2>面试问题</h2><p>当前逐字稿对应的问题</p></div><button className="icon-button" type="button" aria-label="添加问题" onClick={() => setModal("question")}><Plus size={17} /></button></div>{data.questions.map(q => <article className="question-detail" key={q.id}><div className="question-title"><Quotes size={18} /><span>{q.category} / {q.difficulty}</span></div><h3>{q.content}</h3><div><span>考察维度</span><div className="tags">{q.evaluation_dimensions.map(tag => <span key={tag}>{tag}</span>)}</div></div><div><span>参考观察点</span><ul>{q.reference_points.map(point => <li key={point}>{point}</li>)}</ul></div></article>)}</aside>
    </div>
    {modal === "question" && <Dialog title="添加面试问题" description="问题和考察维度会与逐字稿独立保存。" close={() => setModal(null)}><form onSubmit={createQuestion} className="form-grid"><label className="full"><span>问题标题</span><input name="title" required /></label><label className="full"><span>问题内容</span><textarea name="content" required /></label><label><span>分类</span><select name="category"><option>技术题</option><option>情境题</option><option>团队协作题</option><option>学习目标题</option></select></label><label><span>难度</span><select name="difficulty"><option>基础</option><option>进阶</option></select></label><label className="full"><span>考察维度</span><input name="dimensions" placeholder="Debug 思维、系统思维" /></label><label className="full"><span>参考观察点</span><input name="points" placeholder="供电、通信、配置" /></label><FormActions saving={saving} close={() => setModal(null)} label="添加问题" /></form></Dialog>}
    {modal === "utterance" && <Dialog title="录入逐字稿" description="每段话都保留 Speaker、时间和问题映射。" close={() => setModal(null)}><form onSubmit={createUtterance} className="form-grid"><label><span>Speaker ID</span><input name="speaker_id" placeholder="speaker-3" required /></label><label><span>显示姓名</span><input name="speaker_name" required /></label><label><span>Speaker 角色</span><select name="speaker_role"><option value="candidate">候选人</option><option value="interviewer">面试官</option><option value="observer">观察员</option></select></label><label><span>关联问题</span><select name="question_id"><option value="">不关联</option>{data.questions.map(q => <option value={q.id} key={q.id}>{q.title}</option>)}</select></label><label><span>开始秒数</span><input name="start_time" type="number" min="0" defaultValue="0" required /></label><label><span>结束秒数</span><input name="end_time" type="number" min="1" defaultValue="10" required /></label><label className="full"><span>逐字稿内容</span><textarea name="text" required /></label><FormActions saving={saving} close={() => setModal(null)} label="保存逐字稿" /></form></Dialog>}
    {modal === "speaker" && selectedSpeaker && <Dialog title="修正 Speaker" description={`所有 ${selectedSpeaker.speaker_id} 的 Utterance 会同步更新。`} close={() => setModal(null)}><form onSubmit={mapSpeaker} className="form-grid"><label className="full"><span>显示姓名</span><input name="speaker_name" defaultValue={selectedSpeaker.speaker_name} required /></label><label className="full"><span>Speaker 角色</span><select name="speaker_role" defaultValue={selectedSpeaker.speaker_role}><option value="candidate">候选人</option><option value="interviewer">面试官</option><option value="observer">观察员</option></select></label><FormActions saving={saving} close={() => setModal(null)} label="保存映射" /></form></Dialog>}
  </div>;
}

function formatTime(seconds: number) { return `00:${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`; }
function splitList(value: FormDataEntryValue | null) { return String(value ?? "").split(/[、,，]/).map(v => v.trim()).filter(Boolean); }

function Dialog({ title, description, close, children }: { title: string; description: string; close: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={close}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onMouseDown={e => e.stopPropagation()}><div className="modal-heading"><div><h2 id="dialog-title">{title}</h2><p>{description}</p></div><button className="icon-button" type="button" onClick={close}><X size={18} /></button></div>{children}</div></div>;
}

function FormActions({ saving, close, label }: { saving: boolean; close: () => void; label: string }) {
  return <div className="form-actions full"><button className="button secondary" type="button" onClick={close}>取消</button><button className="button primary" type="submit" disabled={saving}>{saving ? "正在保存" : label}</button></div>;
}
