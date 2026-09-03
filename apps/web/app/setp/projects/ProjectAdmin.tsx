"use client";

import Link from "next/link";
import { CalendarBlank, CheckCircle, CurrencyCny, FileArrowUp, Flag, PencilSimple, Plus, WarningCircle } from "@phosphor-icons/react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AdminDialog, formatDate, localDateTimeValue, OperationsFileList } from "../../components/OperationsUI";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { api, apiForm } from "../../lib/api";
import type { ProjectStage, SetpProject, SetpTeam } from "../../types";

export type ProjectMode = "application" | "progress" | "midterm" | "final" | "budget";
type Dialog = "project" | "document" | "review" | "issue" | "expense" | "budget" | null;
const modeDetails: Record<ProjectMode, { eyebrow: string; title: string; description: string }> = {
  application: { eyebrow: "Project Intake", title: "项目申请与审核", description: "归档小组申请文件，维护项目基础信息，并记录管理员审核结论。" },
  progress: { eyebrow: "Fortnightly Review", title: "项目进度管理与查看", description: "每两周登记项目问题、已采取措施和下一阶段计划。" },
  midterm: { eyebrow: "Midterm Defense", title: "项目中期答辩", description: "管理中期材料、汇报 PPT、答辩记录与评审结论。" },
  final: { eyebrow: "Final Defense", title: "结题答辩", description: "管理结题材料、汇报 PPT、答辩记录与最终结论。" },
  budget: { eyebrow: "Project Finance", title: "经费管理", description: "维护项目预算，登记每笔支出并实时查看余额。" },
};
const projectTabs: { href: string; mode: ProjectMode; label: string }[] = [
  { href: "/setp/projects/application", mode: "application", label: "申请与审核" },
  { href: "/setp/projects/progress", mode: "progress", label: "进度" },
  { href: "/setp/projects/midterm", mode: "midterm", label: "中期答辩" },
  { href: "/setp/projects/final", mode: "final", label: "结题答辩" },
  { href: "/setp/projects/budget", mode: "budget", label: "经费" },
];
const reviewLabels: Record<string, string> = { draft: "待提交", pending: "待审核", approved: "已通过", revision_required: "需修改", rejected: "未通过", not_started: "未开始", completed: "已完成" };

export default function ProjectAdmin({ mode }: { mode: ProjectMode }) {
  const [projects, setProjects] = useState<SetpProject[]>([]);
  const [teams, setTeams] = useState<SetpTeam[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setLoading(true); setError("");
    Promise.all([api<SetpProject[]>("/api/operations/setp/projects"), api<SetpTeam[]>("/api/operations/setp/teams")])
      .then(([projectRows, teamRows]) => { setProjects(projectRows); setTeams(teamRows); setSelectedId(current => current ?? projectRows[0]?.id ?? null); })
      .catch(reason => setError(reason instanceof Error ? reason.message : "加载失败")).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  const selected = useMemo(() => projects.find(project => project.id === selectedId) ?? null, [projects, selectedId]);
  const stageName = mode === "midterm" ? "midterm" : mode === "final" ? "final" : "application";
  const stage: ProjectStage | null = selected ? selected[stageName] : null;
  const details = modeDetails[mode];
  const totalSpent = selected?.expenses.reduce((sum, expense) => sum + expense.amount, 0) ?? 0;

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); const form = new FormData(event.currentTarget);
    const payload = { title: form.get("title"), team_id: form.get("team_id") ? Number(form.get("team_id")) : null,
      summary: form.get("summary"), status: form.get("status"), budget_total: Number(form.get("budget_total") || 0) };
    try {
      await api(selected ? `/api/operations/setp/projects/${selected.id}` : "/api/operations/setp/projects", { method: selected ? "PUT" : "POST", body: JSON.stringify(payload) });
      setDialog(null); load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "项目保存失败"); }
    finally { setSaving(false); }
  }

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; setSaving(true); setError("");
    try { await apiForm(`/api/operations/setp/projects/${selected.id}/documents/${stageName}`, new FormData(event.currentTarget)); setDialog(null); load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "材料上传失败"); }
    finally { setSaving(false); }
  }

  async function saveReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; setSaving(true); setError(""); const form = new FormData(event.currentTarget);
    try {
      await api(`/api/operations/setp/projects/${selected.id}/reviews/${stageName}`, { method: "PUT", body: JSON.stringify({ status: form.get("status"), review_notes: form.get("review_notes"), defense_record: form.get("defense_record") || "" }) });
      setDialog(null); load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "审核保存失败"); }
    finally { setSaving(false); }
  }

  async function addIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; setSaving(true); setError(""); const form = new FormData(event.currentTarget);
    try {
      await api(`/api/operations/setp/projects/${selected.id}/issues`, { method: "POST", body: JSON.stringify({ period_start: form.get("period_start"), problems: form.get("problems"), actions: form.get("actions"), next_steps: form.get("next_steps") }) });
      setDialog(null); load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "进度记录保存失败"); }
    finally { setSaving(false); }
  }

  async function addExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; setSaving(true); setError(""); const form = new FormData(event.currentTarget);
    try {
      await api(`/api/operations/setp/projects/${selected.id}/expenses`, { method: "POST", body: JSON.stringify({ item: form.get("item"), amount: Number(form.get("amount")), note: form.get("note"), occurred_at: form.get("occurred_at") }) });
      setDialog(null); load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "支出保存失败"); }
    finally { setSaving(false); }
  }

  async function saveBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; setSaving(true); setError(""); const form = new FormData(event.currentTarget);
    try {
      await api(`/api/operations/setp/projects/${selected.id}`, { method: "PUT", body: JSON.stringify({ title: selected.title, team_id: selected.team_id, summary: selected.summary, status: selected.status, budget_total: Number(form.get("budget_total")) }) });
      setDialog(null); load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "预算保存失败"); }
    finally { setSaving(false); }
  }

  return <div className="page operations-page project-admin-page">
    <div className="page-heading"><div><p className="eyebrow">{details.eyebrow}</p><h1>{details.title}</h1><p>{details.description}</p></div>{mode === "application" && <button className="button primary" type="button" onClick={() => { setSelectedId(null); setDialog("project"); }}><Plus size={17} /> 新建项目</button>}</div>
    <nav className="project-tabs" aria-label="项目管理流程">{projectTabs.map(tab => <Link className={tab.mode === mode ? "active" : ""} href={tab.href} key={tab.mode}>{tab.label}</Link>)}</nav>
    {error && <ErrorState message={error} retry={load} />}
    {loading ? <LoadingState rows={6} /> : projects.length === 0 ? <EmptyState title="还没有 SETP 项目" description="先在“项目申请与审核”创建项目并关联 SETP 小组。" /> : <div className="operations-split project-split">
      <section className="panel operations-list-panel"><div className="panel-heading"><div><h2>项目列表</h2><p>{projects.length} 个项目</p></div></div><div className="operations-select-list">{projects.map(project => <button type="button" className={selectedId === project.id ? "active" : ""} onClick={() => setSelectedId(project.id)} key={project.id}><span className={`status-chip ${project.issue_overdue ? "pending" : "active"}`}>{project.team_name}</span><strong>{project.title}</strong><small>{mode === "progress" ? `下次记录 ${formatDate(project.next_issue_due, false)}` : reviewLabels[project[stageName].status] ?? project[stageName].status}</small></button>)}</div></section>
      {selected && <section className="panel operations-detail-panel project-detail-panel"><div className="panel-heading"><div><span className="status-chip active">{selected.team_name}</span><h2>{selected.title}</h2><p>{selected.summary || "未填写项目简介"}</p></div>{mode === "application" && <button className="button secondary" type="button" onClick={() => setDialog("project")}><PencilSimple size={16} /> 编辑项目</button>}</div>
        {mode === "progress" ? <ProgressView project={selected} open={() => setDialog("issue")} /> : mode === "budget" ? <BudgetView project={selected} totalSpent={totalSpent} openExpense={() => setDialog("expense")} openBudget={() => setDialog("budget")} /> : stage && <StageView mode={mode} stage={stage} openDocument={() => setDialog("document")} openReview={() => setDialog("review")} />}
      </section>}
    </div>}
    {dialog === "project" && <AdminDialog title={selected ? "编辑项目申请" : "新建项目申请"} description="项目申请关联 SETP 小组，并作为后续进度、答辩和经费记录的主档案。" close={() => setDialog(null)}><form className="form-grid" onSubmit={saveProject}><label className="full"><span>项目名称</span><input name="title" defaultValue={selected?.title ?? ""} required /></label><label><span>所属小组</span><select name="team_id" defaultValue={selected?.team_id ?? ""}><option value="">暂不关联</option>{teams.map(team => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label><label><span>项目状态</span><select name="status" defaultValue={selected?.status ?? "application"}><option value="application">申请阶段</option><option value="active">进行中</option><option value="midterm">中期阶段</option><option value="final">结题阶段</option><option value="completed">已完成</option></select></label><label className="full"><span>项目简介</span><textarea name="summary" defaultValue={selected?.summary ?? ""} /></label><label><span>项目预算（元）</span><input name="budget_total" type="number" min="0" step="0.01" defaultValue={selected?.budget_total ?? 0} /></label><div className="form-actions full"><button className="button secondary" type="button" onClick={() => setDialog(null)}>取消</button><button className="button primary" disabled={saving}>{saving ? "正在保存" : "保存项目"}</button></div></form></AdminDialog>}
    {dialog === "document" && selected && <AdminDialog title="上传项目材料" description={`文件归档到“${details.title}”阶段。`} close={() => setDialog(null)}><form className="form-grid" onSubmit={uploadDocument}><label className="full"><span>资料名称</span><input name="title" required /></label><label><span>资料类型</span><select name="kind" defaultValue={mode === "midterm" || mode === "final" ? "slides" : "application"}><option value="application">申请文件</option><option value="slides">汇报 PPT</option><option value="recording">答辩录像</option><option value="document">其他文档</option></select></label><label><span>选择文件</span><input name="file" type="file" required /></label><div className="form-actions full"><button className="button secondary" type="button" onClick={() => setDialog(null)}>取消</button><button className="button primary" disabled={saving}>{saving ? "正在上传" : "上传材料"}</button></div></form></AdminDialog>}
    {dialog === "review" && selected && stage && <AdminDialog title={`${details.title}记录`} description="管理员结论会保存在项目档案中。" close={() => setDialog(null)}><form className="form-grid" onSubmit={saveReview}><label className="full"><span>阶段状态</span><select name="status" defaultValue={stage.status}><option value="pending">待审核</option><option value="approved">已通过</option><option value="revision_required">需修改</option><option value="rejected">未通过</option><option value="completed">已完成</option></select></label>{mode !== "application" && <label className="full"><span>答辩记录</span><textarea name="defense_record" defaultValue={stage.defense_record ?? ""} placeholder="记录主要问题、现场回答和评委意见" /></label>}<label className="full"><span>审核意见</span><textarea name="review_notes" defaultValue={stage.review_notes} /></label><div className="form-actions full"><button className="button secondary" type="button" onClick={() => setDialog(null)}>取消</button><button className="button primary" disabled={saving}>保存记录</button></div></form></AdminDialog>}
    {dialog === "issue" && selected && <AdminDialog title="登记双周问题" description="记录本周期暴露的问题、处理动作和下周期计划。" close={() => setDialog(null)}><form className="form-grid" onSubmit={addIssue}><label className="full"><span>周期开始时间</span><input type="datetime-local" name="period_start" defaultValue={localDateTimeValue()} required /></label><label className="full"><span>本周期问题</span><textarea name="problems" required /></label><label className="full"><span>已采取措施</span><textarea name="actions" /></label><label className="full"><span>下一步计划</span><textarea name="next_steps" /></label><div className="form-actions full"><button className="button secondary" type="button" onClick={() => setDialog(null)}>取消</button><button className="button primary" disabled={saving}>保存进度</button></div></form></AdminDialog>}
    {dialog === "expense" && selected && <AdminDialog title="登记项目支出" description="金额将计入已使用经费和项目余额。" close={() => setDialog(null)}><form className="form-grid" onSubmit={addExpense}><label className="full"><span>支出事项</span><input name="item" required /></label><label><span>金额（元）</span><input name="amount" type="number" min="0" step="0.01" required /></label><label><span>发生时间</span><input name="occurred_at" type="datetime-local" defaultValue={localDateTimeValue()} required /></label><label className="full"><span>备注</span><textarea name="note" /></label><div className="form-actions full"><button className="button secondary" type="button" onClick={() => setDialog(null)}>取消</button><button className="button primary" disabled={saving}>保存支出</button></div></form></AdminDialog>}
    {dialog === "budget" && selected && <AdminDialog title="调整项目预算" description="修改总预算，不改变已登记的支出记录。" close={() => setDialog(null)}><form className="form-grid" onSubmit={saveBudget}><label className="full"><span>总预算（元）</span><input name="budget_total" type="number" min="0" step="0.01" defaultValue={selected.budget_total} required /></label><div className="form-actions full"><button className="button secondary" type="button" onClick={() => setDialog(null)}>取消</button><button className="button primary" disabled={saving}>保存预算</button></div></form></AdminDialog>}
  </div>;
}

function StageView({ mode, stage, openDocument, openReview }: { mode: ProjectMode; stage: ProjectStage; openDocument: () => void; openReview: () => void }) {
  return <><div className="project-stage-summary"><div><span>阶段状态</span><strong>{reviewLabels[stage.status] ?? stage.status}</strong></div><div><span>材料数量</span><strong>{stage.documents.length}</strong></div><div><span>最近审核</span><strong>{formatDate(stage.reviewed_at, false)}</strong></div></div><div className="operations-section-heading"><div><h3>{mode === "application" ? "申请文件" : "答辩材料"}</h3><p>{mode === "application" ? "申请书、技术方案和小组补充文件。" : "汇报 PPT、说明文档和答辩录像。"}</p></div><div className="heading-actions"><button className="button secondary" type="button" onClick={openReview}><CheckCircle size={16} /> {mode === "application" ? "审核" : "答辩记录"}</button><button className="button primary" type="button" onClick={openDocument}><FileArrowUp size={16} /> 上传材料</button></div></div><OperationsFileList files={stage.documents} />{stage.defense_record && <div className="project-note"><strong>答辩记录</strong><p>{stage.defense_record}</p></div>}{stage.review_notes && <div className="project-note"><strong>审核意见</strong><p>{stage.review_notes}</p></div>}</>;
}

function ProgressView({ project, open }: { project: SetpProject; open: () => void }) {
  return <><div className={`fortnight-banner ${project.issue_overdue ? "overdue" : ""}`}>{project.issue_overdue ? <WarningCircle size={23} /> : <CalendarBlank size={23} />}<div><strong>{project.issue_overdue ? "双周进度已到期" : "下一次进度记录"}</strong><p>{formatDate(project.next_issue_due)} · 每次记录后自动顺延 14 天</p></div><button className="button primary" type="button" onClick={open}><Plus size={16} /> 登记本期问题</button></div>{project.issue_records.length === 0 ? <div className="operations-inline-empty">尚未登记双周问题记录</div> : <div className="project-timeline">{[...project.issue_records].reverse().map(record => <article key={record.id}><span><Flag size={15} /></span><div><time>{formatDate(record.period_start, false)}</time><h3>{record.problems}</h3>{record.actions && <p><strong>处理：</strong>{record.actions}</p>}{record.next_steps && <p><strong>下一步：</strong>{record.next_steps}</p>}</div></article>)}</div>}</>;
}

function BudgetView({ project, totalSpent, openExpense, openBudget }: { project: SetpProject; totalSpent: number; openExpense: () => void; openBudget: () => void }) {
  return <><div className="budget-summary"><article><span>总预算</span><strong>¥{project.budget_total.toFixed(2)}</strong></article><article><span>已使用</span><strong>¥{totalSpent.toFixed(2)}</strong></article><article className={project.budget_total - totalSpent < 0 ? "negative" : ""}><span>剩余</span><strong>¥{(project.budget_total - totalSpent).toFixed(2)}</strong></article></div><div className="operations-section-heading"><div><h3>支出明细</h3><p>{project.expenses.length} 笔记录</p></div><div className="heading-actions"><button className="button secondary" type="button" onClick={openBudget}><PencilSimple size={16} /> 调整预算</button><button className="button primary" type="button" onClick={openExpense}><CurrencyCny size={16} /> 登记支出</button></div></div>{project.expenses.length === 0 ? <div className="operations-inline-empty">尚未登记项目支出</div> : <div className="expense-list">{[...project.expenses].reverse().map(expense => <article key={expense.id}><div><strong>{expense.item}</strong><small>{formatDate(expense.occurred_at, false)} · {expense.note || "无备注"}</small></div><b>¥{expense.amount.toFixed(2)}</b></article>)}</div>}</>;
}
