"use client";

import Link from "next/link";
import {
  ArrowRight, CalendarBlank, CheckCircle, ClockCountdown, Files, Plus, UsersThree, Warning, X,
} from "@phosphor-icons/react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { ApplicationSummary, ResearchTask, ResearchTeamSummary } from "../types";
import { EmptyState, ErrorState, LoadingState } from "../components/States";

type DialogName = "task" | "team" | null;

const statusLabels: Record<string, string> = {
  assigned: "待开始", in_progress: "准备材料", submitted: "待分析",
  analyzed: "已分析", review_required: "待人工复核", decided: "已完成",
};

export default function ResearchQueuePage() {
  const [teams, setTeams] = useState<ResearchTeamSummary[]>([]);
  const [tasks, setTasks] = useState<ResearchTask[]>([]);
  const [applications, setApplications] = useState<ApplicationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<DialogName>(null);
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError("");
    Promise.all([
      api<ResearchTeamSummary[]>("/api/research/teams"),
      api<ResearchTask[]>("/api/research/tasks"),
      api<ApplicationSummary[]>("/api/applications"),
    ]).then(([teamRows, taskRows, applicationRows]) => {
      setTeams(teamRows); setTasks(taskRows); setApplications(applicationRows);
      setSelectedTaskId(current => current ?? taskRows.find(task => task.status === "active")?.id ?? null);
    }).catch(reason => setError(reason instanceof Error ? reason.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const assignedIds = useMemo(() => new Set(teams.flatMap(team => team.members.map(member => `${team.task_id}-${member.member_id}`))), [teams]);
  const reviewCount = teams.filter(team => team.status === "review_required").length;
  const activeCount = teams.filter(team => !["decided"].includes(team.status)).length;

  function toggleMember(memberId: number) {
    setSelectedMembers(current => current.includes(memberId)
      ? current.filter(value => value !== memberId)
      : current.length < 3 ? [...current, memberId] : current);
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/research/tasks", { method: "POST", body: JSON.stringify({
        title: form.get("title"), description: form.get("description"),
        duration_days: Number(form.get("duration_days") ?? 7),
      }) });
      setDialog(null); load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "创建失败"); }
    finally { setSaving(false); }
  }

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedMembers.length !== 3) { setError("请准确选择 3 名候选人"); return; }
    setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/research/teams", { method: "POST", body: JSON.stringify({
        task_id: Number(form.get("task_id")), name: form.get("name"),
        member_ids: selectedMembers, leader_member_id: selectedMembers[0],
      }) });
      setSelectedMembers([]); setDialog(null); load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "组队失败"); }
    finally { setSaving(false); }
  }

  return <div className="page research-queue-page">
    <div className="page-heading">
      <div><p className="eyebrow">Research Review</p><h1>调研审核</h1><p>三名候选人一组，在一周内完成水下机器人调研；团队成果与个人贡献分开评价。</p></div>
      <div className="heading-actions">
        <button className="button secondary" type="button" onClick={() => setDialog("task")}><CalendarBlank size={17} /> 新建任务</button>
        <button className="button primary" type="button" disabled={tasks.length === 0} onClick={() => { setSelectedMembers([]); setDialog("team"); }}><Plus size={17} /> 创建三人小队</button>
      </div>
    </div>

    <section className="research-metrics" aria-label="调研审核概况">
      <article><span>进行中小队</span><strong>{activeCount}</strong><small>从分组到最终决策</small><UsersThree size={22} /></article>
      <article><span>待人工复核</span><strong>{reviewCount}</strong><small>AI 只提供可追溯建议</small><Warning size={22} /></article>
      <article><span>已完成决策</span><strong>{teams.filter(team => team.status === "decided").length}</strong><small>逐人确认，不按团队一刀切</small><CheckCircle size={22} /></article>
    </section>

    {error && <ErrorState message={error} retry={load} />}
    {loading ? <LoadingState rows={5} /> : teams.length === 0 ? <EmptyState title="还没有调研小队" description="先新建一项水下机器人调研任务，再选择三名候选人组队。" /> : <section className="research-team-list">
      <div className="research-list-heading"><div><h2>审核队列</h2><p>优先处理已提交、待分析和待人工复核的小队。</p></div><span>{teams.length} 个小队</span></div>
      {teams.map(team => <Link href={`/research/${team.id}`} className="research-team-row" key={team.id}>
        <div className="research-team-state"><span className={`status-chip ${team.status === "review_required" ? "pending" : team.status === "decided" ? "accepted" : "active"}`}>{statusLabels[team.status] ?? team.status}</span><small>{team.task_title}</small></div>
        <div className="research-team-main"><strong>{team.name}</strong><div className="research-team-people">{team.members.map(member => <span key={member.member_id}><b>{member.name.slice(0, 1)}</b>{member.name}{member.is_leader ? " · 队长" : ""}</span>)}</div></div>
        <div className="research-progress"><span>材料 <b>{team.file_count}</b></span><span>个人说明 <b>{team.contribution_count}/3</b></span><span>决策 <b>{team.decision_count}/3</b></span></div>
        <div className="research-deadline"><ClockCountdown size={16} /><span>{deadlineLabel(team.due_at)}</span>{team.team_score !== null && <strong>{team.team_score}/40</strong>}</div>
        <ArrowRight size={19} />
      </Link>)}
    </section>}

    {dialog === "task" && <Dialog title="新建调研任务" description="第一版使用统一的水下机器人调研要求和 40+60 评分标准。" close={() => setDialog(null)}>
      <form className="form-grid" onSubmit={createTask}>
        <label className="full"><span>任务名称</span><input name="title" defaultValue="水下机器人一周调研" required /></label>
        <label className="full"><span>任务说明</span><textarea name="description" defaultValue="3 名候选人组成一队，完成水下机器人类型、系统组成、典型案例、技术难点和社团落地建议的调研。" /></label>
        <label><span>任务周期</span><select name="duration_days" defaultValue="7"><option value="7">7 天</option><option value="5">5 天</option><option value="10">10 天</option></select></label>
        <div className="form-actions full"><button className="button secondary" type="button" onClick={() => setDialog(null)}>取消</button><button className="button primary" disabled={saving}>{saving ? "正在创建" : "创建任务"}</button></div>
      </form>
    </Dialog>}

    {dialog === "team" && <Dialog wide title="创建三人调研小队" description="请选择同一任务下尚未分组的三名候选人；第一位选择者默认为队长。" close={() => setDialog(null)}>
      <form onSubmit={createTeam}>
        <div className="form-grid">
          <label><span>所属任务</span><select name="task_id" required value={selectedTaskId ?? ""} onChange={event => { setSelectedTaskId(Number(event.target.value)); setSelectedMembers([]); }}>{tasks.filter(task => task.status === "active").map(task => <option value={task.id} key={task.id}>{task.title}</option>)}</select></label>
          <label><span>小队名称</span><input name="name" placeholder="例如：深潜一组" required /></label>
        </div>
        <div className="candidate-picker-heading"><strong>选择候选人</strong><span className={selectedMembers.length === 3 ? "complete" : ""}>{selectedMembers.length}/3</span></div>
        <div className="candidate-picker">{applications.map(application => {
          const unavailable = selectedTaskId ? assignedIds.has(`${selectedTaskId}-${application.member_id}`) : false;
          const selected = selectedMembers.includes(application.member_id);
          return <button type="button" disabled={unavailable} className={selected ? "candidate-option selected" : "candidate-option"} onClick={() => toggleMember(application.member_id)} key={application.id}>
            <span className="member-avatar">{application.name.slice(0, 1)}</span><span><strong>{application.name}</strong><small>{application.student_id} · {application.major || "专业待补充"}</small></span><i>{unavailable ? "已分组" : selected ? selectedMembers[0] === application.member_id ? "队长" : "已选择" : "选择"}</i>
          </button>;
        })}</div>
        <div className="form-actions"><button className="button secondary" type="button" onClick={() => setDialog(null)}>取消</button><button className="button primary" disabled={saving || selectedMembers.length !== 3}>{saving ? "正在创建" : "创建小队"}</button></div>
      </form>
    </Dialog>}
  </div>;
}

function Dialog({ title, description, close, children, wide = false }: { title: string; description: string; close: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={close}><div className={`modal ${wide ? "research-wide-modal" : ""}`} role="dialog" aria-modal="true" aria-labelledby="research-dialog-title" onMouseDown={event => event.stopPropagation()}><div className="modal-heading"><div><h2 id="research-dialog-title">{title}</h2><p>{description}</p></div><button className="icon-button" type="button" onClick={close} aria-label="关闭"><X size={18} /></button></div>{children}</div></div>;
}

function deadlineLabel(value: string | null) {
  if (!value) return "未设置截止时间";
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
  return days < 0 ? `已逾期 ${Math.abs(days)} 天` : days === 0 ? "今天截止" : `剩余 ${days} 天`;
}
