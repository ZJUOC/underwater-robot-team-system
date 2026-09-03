"use client";

import { CalendarBlank, ChalkboardTeacher, Clock, MapPin, PencilSimple, Plus, UploadSimple } from "@phosphor-icons/react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AdminDialog, formatDate, localDateTimeValue, OperationsFileList } from "../../components/OperationsUI";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { api, apiForm } from "../../lib/api";
import type { CourseSession } from "../../types";

type Dialog = "class" | "material" | null;
const statusLabels: Record<string, string> = { scheduled: "待开课", completed: "已结束", canceled: "已取消" };

export default function CourseSessionsPage() {
  const [sessions, setSessions] = useState<CourseSession[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setLoading(true); setError("");
    api<CourseSession[]>("/api/operations/classes").then(rows => { setSessions(rows); setSelectedId(current => current ?? rows[0]?.id ?? null); })
      .catch(reason => setError(reason instanceof Error ? reason.message : "加载失败")).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  const selected = useMemo(() => sessions.find(row => row.id === selectedId) ?? null, [sessions, selectedId]);

  async function saveSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); const form = new FormData(event.currentTarget);
    const payload = { title: form.get("title"), starts_at: form.get("starts_at"), duration_minutes: Number(form.get("duration_minutes")),
      location: form.get("location"), description: form.get("description"), status: form.get("status") };
    try {
      await api(selected ? `/api/operations/classes/${selected.id}` : "/api/operations/classes", { method: selected ? "PUT" : "POST", body: JSON.stringify(payload) });
      setDialog(null); load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败"); }
    finally { setSaving(false); }
  }

  async function uploadMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return;
    setSaving(true); setError("");
    try { await apiForm(`/api/operations/classes/${selected.id}/materials`, new FormData(event.currentTarget)); setDialog(null); load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "上传失败"); }
    finally { setSaving(false); }
  }

  return <div className="page operations-page">
    <div className="page-heading"><div><p className="eyebrow">Course Administration</p><h1>课时管理</h1><p>维护课程时间、地点和状态，集中上传录播、PPT 与配套资料供成员下载。</p></div><button className="button primary" type="button" onClick={() => { setSelectedId(null); setDialog("class"); }}><Plus size={17} /> 新建课时</button></div>
    <section className="operations-metrics"><article><span>全部课时</span><strong>{sessions.length}</strong><small>课程排期</small><CalendarBlank size={22} /></article><article><span>待开课</span><strong>{sessions.filter(row => row.status === "scheduled").length}</strong><small>仍可编辑</small><ChalkboardTeacher size={22} /></article><article><span>已上传资料</span><strong>{sessions.flatMap(row => row.materials).length}</strong><small>认证后可下载</small><UploadSimple size={22} /></article></section>
    {error && <ErrorState message={error} retry={load} />}
    {loading ? <LoadingState rows={5} /> : sessions.length === 0 ? <EmptyState title="还没有课程安排" description="点击“新建课时”录入时间、地点和课程内容。" /> : <div className="operations-split">
      <section className="panel operations-list-panel"><div className="panel-heading"><div><h2>课程日历</h2><p>按开课时间倒序排列</p></div></div><div className="operations-select-list">{sessions.map(session => <button type="button" key={session.id} className={selectedId === session.id ? "active" : ""} onClick={() => setSelectedId(session.id)}><span className={`status-chip ${session.status === "scheduled" ? "active" : ""}`}>{statusLabels[session.status] ?? session.status}</span><strong>{session.title}</strong><small>{formatDate(session.starts_at)} · {session.location || "地点待定"}</small></button>)}</div></section>
      {selected && <section className="panel operations-detail-panel"><div className="panel-heading"><div><span className="status-chip active">{statusLabels[selected.status] ?? selected.status}</span><h2>{selected.title}</h2><p>{selected.description || "未填写课程说明"}</p></div><button className="button secondary" type="button" onClick={() => setDialog("class")}><PencilSimple size={16} /> 编辑课时</button></div><div className="operations-meta-row"><div><Clock size={17} /><span>时间</span><strong>{formatDate(selected.starts_at)} · {selected.duration_minutes} 分钟</strong></div><div><MapPin size={17} /><span>地点</span><strong>{selected.location || "待定"}</strong></div></div><div className="operations-section-heading"><div><h3>课程资料</h3><p>录播、PPT 和文档均通过登录态下载。</p></div><button className="button secondary" type="button" onClick={() => setDialog("material")}><UploadSimple size={16} /> 上传资料</button></div><OperationsFileList files={selected.materials} /></section>}
    </div>}
    {dialog === "class" && <AdminDialog title={selected ? "编辑课时" : "新建课时"} description="课程安排保存后会同步到考勤管理的课时列表。" close={() => setDialog(null)}><form className="form-grid" onSubmit={saveSession}><label className="full"><span>课程名称</span><input name="title" defaultValue={selected?.title ?? ""} required /></label><label><span>开课时间</span><input type="datetime-local" name="starts_at" defaultValue={localDateTimeValue(selected?.starts_at)} required /></label><label><span>时长（分钟）</span><input type="number" min="15" max="480" name="duration_minutes" defaultValue={selected?.duration_minutes ?? 90} required /></label><label><span>地点</span><input name="location" defaultValue={selected?.location ?? ""} /></label><label><span>状态</span><select name="status" defaultValue={selected?.status ?? "scheduled"}><option value="scheduled">待开课</option><option value="completed">已结束</option><option value="canceled">已取消</option></select></label><label className="full"><span>课程说明</span><textarea name="description" defaultValue={selected?.description ?? ""} /></label><div className="form-actions full"><button className="button secondary" type="button" onClick={() => setDialog(null)}>取消</button><button className="button primary" disabled={saving}>{saving ? "正在保存" : "保存课时"}</button></div></form></AdminDialog>}
    {dialog === "material" && selected && <AdminDialog title="上传课程资料" description={`资料将归档到“${selected.title}”，成员登录后可下载。`} close={() => setDialog(null)}><form className="form-grid" onSubmit={uploadMaterial}><label className="full"><span>资料名称</span><input name="title" placeholder="例如：推进器控制基础" required /></label><label><span>资料类型</span><select name="kind" defaultValue="slides"><option value="slides">课程 PPT</option><option value="recording">课程录播</option><option value="document">配套文档</option><option value="archive">资料包</option></select></label><label><span>选择文件</span><input name="file" type="file" required /></label><div className="form-actions full"><button className="button secondary" type="button" onClick={() => setDialog(null)}>取消</button><button className="button primary" disabled={saving}>{saving ? "正在上传" : "上传资料"}</button></div></form></AdminDialog>}
  </div>;
}
