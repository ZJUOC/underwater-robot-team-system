"use client";

import { CheckCircle, ClipboardText, ClockCountdown, PencilSimple, Plus, UploadSimple, UsersThree } from "@phosphor-icons/react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AdminDialog, formatDate, localDateTimeValue } from "../../components/OperationsUI";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { api, apiForm, downloadApiFile } from "../../lib/api";
import type { OperationsMember, RoutineSubmission, RoutineTask } from "../../types";

type Dialog = "task" | "submission" | "review" | null;
const taskStatus: Record<string, string> = { draft: "草稿", published: "进行中", closed: "已结束" };
const submissionStatus: Record<string, string> = { submitted: "待批阅", reviewed: "已批阅", revision_required: "需修改", accepted: "已通过" };

export default function RoutineTasksPage() {
  const [tasks, setTasks] = useState<RoutineTask[]>([]);
  const [members, setMembers] = useState<OperationsMember[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<RoutineSubmission | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setLoading(true); setError("");
    Promise.all([api<RoutineTask[]>("/api/operations/tasks"), api<OperationsMember[]>("/api/operations/members")])
      .then(([taskRows, memberRows]) => { setTasks(taskRows); setMembers(memberRows); setSelectedId(current => current ?? taskRows[0]?.id ?? null); })
      .catch(reason => setError(reason instanceof Error ? reason.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  const selected = useMemo(() => tasks.find(task => task.id === selectedId) ?? null, [tasks, selectedId]);

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    const payload = { title: form.get("title"), description: form.get("description"), due_at: form.get("due_at") || null,
      status: form.get("status"), assignee_ids: form.getAll("assignee_ids").map(Number) };
    try {
      await api(selected && dialog === "task" ? `/api/operations/tasks/${selected.id}` : "/api/operations/tasks",
        { method: selected && dialog === "task" ? "PUT" : "POST", body: JSON.stringify(payload) });
      setDialog(null); load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败"); }
    finally { setSaving(false); }
  }

  async function registerSubmission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return;
    setSaving(true); setError("");
    try { await apiForm(`/api/operations/tasks/${selected.id}/submissions`, new FormData(event.currentTarget)); setDialog(null); load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "登记失败"); }
    finally { setSaving(false); }
  }

  async function reviewSubmission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || !selectedSubmission) return;
    setSaving(true); setError(""); const form = new FormData(event.currentTarget);
    try {
      await api(`/api/operations/tasks/${selected.id}/submissions/${selectedSubmission.id}`, { method: "PUT", body: JSON.stringify({
        status: form.get("status"), feedback: form.get("feedback"), score: form.get("score") ? Number(form.get("score")) : null,
      }) });
      setDialog(null); setSelectedSubmission(null); load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "批阅失败"); }
    finally { setSaving(false); }
  }

  return <div className="page operations-page">
    <div className="page-heading"><div><p className="eyebrow">Routine Work</p><h1>平时任务管理</h1><p>管理员统一布置、分配和批阅成员日常工作，提交记录与附件集中留档。</p></div><button className="button primary" type="button" onClick={() => { setSelectedId(null); setDialog("task"); }}><Plus size={17} /> 布置任务</button></div>
    <section className="operations-metrics"><article><span>进行中</span><strong>{tasks.filter(row => row.status === "published").length}</strong><small>已发布任务</small><ClipboardText size={22} /></article><article><span>待批阅</span><strong>{tasks.flatMap(row => row.submissions).filter(row => row.status === "submitted").length}</strong><small>成员提交</small><ClockCountdown size={22} /></article><article><span>已完成</span><strong>{tasks.filter(row => row.status === "closed").length}</strong><small>归档任务</small><CheckCircle size={22} /></article></section>
    {error && <ErrorState message={error} retry={load} />}
    {loading ? <LoadingState rows={6} /> : tasks.length === 0 ? <EmptyState title="还没有平时任务" description="点击“布置任务”创建第一项日常工作并选择负责成员。" /> : <div className="operations-split">
      <section className="panel operations-list-panel"><div className="panel-heading"><div><h2>任务列表</h2><p>{tasks.length} 项任务，按最近更新排序</p></div></div><div className="operations-select-list">{tasks.map(task => <button key={task.id} className={selectedId === task.id ? "active" : ""} type="button" onClick={() => setSelectedId(task.id)}><span className={`status-chip ${task.status === "published" ? "active" : ""}`}>{taskStatus[task.status] ?? task.status}</span><strong>{task.title}</strong><small>{formatDate(task.due_at)} · {task.submissions.length} 份提交</small></button>)}</div></section>
      {selected && <section className="panel operations-detail-panel"><div className="panel-heading"><div><span className="status-chip active">{taskStatus[selected.status] ?? selected.status}</span><h2>{selected.title}</h2><p>截止 {formatDate(selected.due_at)}</p></div><button className="button secondary" type="button" onClick={() => setDialog("task")}><PencilSimple size={16} /> 编辑任务</button></div>
        <p className="operations-description">{selected.description || "未填写任务说明"}</p><div className="operations-meta-row"><div><UsersThree size={17} /><span>负责成员</span><strong>{selected.assignee_ids.map(id => members.find(member => member.id === id)?.name).filter(Boolean).join("、") || "未指定"}</strong></div><div><UploadSimple size={17} /><span>提交进度</span><strong>{selected.submissions.length}/{selected.assignee_ids.length || 0}</strong></div></div>
        <div className="operations-section-heading"><div><h3>成员提交</h3><p>附件、摘要和批阅结果保存在任务内。</p></div><button className="button secondary" type="button" onClick={() => setDialog("submission")}><Plus size={16} /> 登记提交</button></div>
        {selected.submissions.length === 0 ? <div className="operations-inline-empty">暂时没有成员提交</div> : <div className="submission-list">{selected.submissions.map(submission => <article key={submission.id}><div className="member-avatar">{submission.member_name.slice(0, 1)}</div><div><strong>{submission.member_name}</strong><p>{submission.summary || "未填写提交说明"}</p><small>{formatDate(submission.submitted_at)}{submission.file ? ` · ${submission.file.original_name}` : ""}</small></div><span className={`status-chip ${submission.status === "submitted" ? "pending" : "accepted"}`}>{submissionStatus[submission.status] ?? submission.status}</span><div className="submission-actions">{submission.file && <button className="text-link plain-button" type="button" onClick={() => void downloadApiFile(`/api/operations/files/${submission.file!.id}`, submission.file!.original_name)}>下载</button>}<button className="text-link plain-button" type="button" onClick={() => { setSelectedSubmission(submission); setDialog("review"); }}>批阅</button></div></article>)}</div>}
      </section>}
    </div>}
    {dialog === "task" && <AdminDialog title={selected ? "编辑平时任务" : "布置平时任务"} description="任务保存为草稿或直接发布；可同时分配给多名正式成员。" close={() => setDialog(null)} wide><form className="form-grid" onSubmit={saveTask}><label className="full"><span>任务名称</span><input name="title" defaultValue={selected?.title ?? ""} required /></label><label className="full"><span>任务说明</span><textarea name="description" defaultValue={selected?.description ?? ""} /></label><label><span>截止时间</span><input type="datetime-local" name="due_at" defaultValue={selected?.due_at ? localDateTimeValue(selected.due_at) : ""} /></label><label><span>任务状态</span><select name="status" defaultValue={selected?.status ?? "published"}><option value="draft">草稿</option><option value="published">进行中</option><option value="closed">已结束</option></select></label><fieldset className="operations-member-picker full"><legend>负责成员</legend>{members.map(member => <label key={member.id}><input type="checkbox" name="assignee_ids" value={member.id} defaultChecked={selected?.assignee_ids.includes(member.id)} /><span>{member.name}<small>{member.department || "部门待定"} · {member.grade || "年级待定"}</small></span></label>)}</fieldset><div className="form-actions full"><button className="button secondary" type="button" onClick={() => setDialog(null)}>取消</button><button className="button primary" disabled={saving}>{saving ? "正在保存" : "保存任务"}</button></div></form></AdminDialog>}
    {dialog === "submission" && selected && <AdminDialog title="登记成员提交" description={`为“${selected.title}”补录成员作业，附件可选。`} close={() => setDialog(null)}><form className="form-grid" onSubmit={registerSubmission}><label className="full"><span>提交成员</span><select name="member_id" required>{(selected.assignee_ids.length ? members.filter(member => selected.assignee_ids.includes(member.id)) : members).map(member => <option value={member.id} key={member.id}>{member.name} · {member.student_id}</option>)}</select></label><label className="full"><span>提交说明</span><textarea name="summary" /></label><label className="full"><span>附件</span><input name="file" type="file" /></label><div className="form-actions full"><button className="button secondary" type="button" onClick={() => setDialog(null)}>取消</button><button className="button primary" disabled={saving || members.length === 0}>{saving ? "正在登记" : "登记提交"}</button></div></form></AdminDialog>}
    {dialog === "review" && selectedSubmission && <AdminDialog title={`批阅 · ${selectedSubmission.member_name}`} description="记录批阅状态、成绩和可执行的修改反馈。" close={() => setDialog(null)}><form className="form-grid" onSubmit={reviewSubmission}><label><span>批阅结果</span><select name="status" defaultValue={selectedSubmission.status === "submitted" ? "reviewed" : selectedSubmission.status}><option value="reviewed">已批阅</option><option value="revision_required">需修改</option><option value="accepted">已通过</option></select></label><label><span>成绩（0–100）</span><input name="score" type="number" min="0" max="100" defaultValue={selectedSubmission.score ?? ""} /></label><label className="full"><span>反馈</span><textarea name="feedback" defaultValue={selectedSubmission.feedback} /></label><div className="form-actions full"><button className="button secondary" type="button" onClick={() => setDialog(null)}>取消</button><button className="button primary" disabled={saving}>保存批阅</button></div></form></AdminDialog>}
  </div>;
}
