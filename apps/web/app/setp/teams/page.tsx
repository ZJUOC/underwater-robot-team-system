"use client";

import { ArrowsClockwise, Brain, Crown, PencilSimple, Plus, UserPlus, UsersThree } from "@phosphor-icons/react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AdminDialog } from "../../components/OperationsUI";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { api } from "../../lib/api";
import type { OperationsMember, SetpTeam } from "../../types";

export default function SetpTeamsPage() {
  const [teams, setTeams] = useState<SetpTeam[]>([]);
  const [members, setMembers] = useState<OperationsMember[]>([]);
  const [editing, setEditing] = useState<SetpTeam | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setLoading(true); setError("");
    Promise.all([api<SetpTeam[]>("/api/operations/setp/teams"), api<OperationsMember[]>("/api/operations/members")])
      .then(([teamRows, memberRows]) => { setTeams(teamRows); setMembers(memberRows); })
      .catch(reason => setError(reason instanceof Error ? reason.message : "加载失败")).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  const assignedIds = useMemo(() => new Set(teams.flatMap(team => team.member_ids)), [teams]);
  const unassignedCount = members.filter(member => !assignedIds.has(member.id)).length;

  async function generateTeams(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); const form = new FormData(event.currentTarget);
    try {
      await api("/api/operations/setp/teams/smart", { method: "POST", body: JSON.stringify({ team_size: Number(form.get("team_size")), name_prefix: form.get("name_prefix") }) });
      load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "智能组队失败"); }
    finally { setSaving(false); }
  }

  async function saveTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); const form = new FormData(event.currentTarget);
    const memberIds = form.getAll("member_ids").map(Number);
    try {
      await api(editing ? `/api/operations/setp/teams/${editing.id}` : "/api/operations/setp/teams", { method: editing ? "PUT" : "POST", body: JSON.stringify({
        name: form.get("name"), status: form.get("status"), member_ids: memberIds,
        leader_member_id: form.get("leader_member_id") ? Number(form.get("leader_member_id")) : memberIds[0] ?? null,
      }) });
      setDialogOpen(false); setEditing(null); load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败"); }
    finally { setSaving(false); }
  }

  return <div className="page operations-page">
    <div className="page-heading"><div><p className="eyebrow">SETP Team Formation</p><h1>组队管理</h1><p>先用智能组队均衡分配未组队成员，再由管理员手动调组、指定队长和维护状态。</p></div><button className="button primary" type="button" onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus size={17} /> 手动建组</button></div>
    <section className="smart-team-panel panel"><div><span className="smart-icon"><Brain size={24} /></span><div><h2>智能组队</h2><p>仅处理尚未加入 SETP 小组的正式成员；生成后仍可逐组调整。</p></div></div><form onSubmit={generateTeams}><label><span>每组人数</span><select name="team_size" defaultValue="3"><option value="2">2 人</option><option value="3">3 人</option><option value="4">4 人</option><option value="5">5 人</option></select></label><label><span>小组名称前缀</span><input name="name_prefix" defaultValue="SETP 小组" required /></label><button className="button primary" disabled={saving || unassignedCount === 0}><ArrowsClockwise size={16} /> {saving ? "正在组队" : `分配 ${unassignedCount} 人`}</button></form></section>
    <section className="operations-metrics"><article><span>SETP 小组</span><strong>{teams.length}</strong><small>当前分组</small><UsersThree size={22} /></article><article><span>已分配成员</span><strong>{assignedIds.size}</strong><small>可手动调组</small><UserPlus size={22} /></article><article><span>尚未组队</span><strong>{unassignedCount}</strong><small>等待智能或手动分配</small><Brain size={22} /></article></section>
    {error && <ErrorState message={error} retry={load} />}
    {loading ? <LoadingState rows={5} /> : teams.length === 0 ? <EmptyState title="还没有 SETP 小组" description="使用智能组队分配正式成员，或手动创建小组。" /> : <section className="setp-team-grid">{teams.map(team => <article className="panel setp-team-card" key={team.id}><div className="setp-team-heading"><div><span className={`status-chip ${team.status === "active" ? "active" : ""}`}>{team.status === "active" ? "进行中" : "已归档"}</span><h2>{team.name}</h2></div><button className="icon-button" type="button" title="调整小组" onClick={() => { setEditing(team); setDialogOpen(true); }}><PencilSimple size={17} /></button></div><div className="setp-member-list">{team.members.length === 0 ? <div className="operations-inline-empty">暂无组员</div> : team.members.map(member => <div key={member.id}><span className="member-avatar">{member.name.slice(0, 1)}</span><div><strong>{member.name}</strong><small>{member.department || "部门待定"} · {member.grade || "年级待定"}</small></div>{member.is_leader && <span className="leader-label"><Crown size={14} /> 队长</span>}</div>)}</div></article>)}</section>}
    {dialogOpen && <AdminDialog title={editing ? `调整 ${editing.name}` : "手动创建 SETP 小组"} description="选中的成员若已在其他小组，会自动移入当前小组。" close={() => { setDialogOpen(false); setEditing(null); }} wide><form className="form-grid" onSubmit={saveTeam}><label><span>小组名称</span><input name="name" defaultValue={editing?.name ?? ""} required /></label><label><span>状态</span><select name="status" defaultValue={editing?.status ?? "active"}><option value="active">进行中</option><option value="archived">已归档</option></select></label><label className="full"><span>队长</span><select name="leader_member_id" defaultValue={editing?.leader_member_id ?? ""}><option value="">由系统选择首位组员</option>{members.map(member => <option value={member.id} key={member.id}>{member.name} · {member.department || "部门待定"}</option>)}</select></label><fieldset className="operations-member-picker full"><legend>小组成员</legend>{members.map(member => { const otherTeam = teams.find(team => team.id !== editing?.id && team.member_ids.includes(member.id)); return <label key={member.id}><input type="checkbox" name="member_ids" value={member.id} defaultChecked={editing?.member_ids.includes(member.id)} /><span>{member.name}<small>{member.department || "部门待定"}{otherTeam ? ` · 当前在 ${otherTeam.name}` : " · 未组队"}</small></span></label>; })}</fieldset><div className="form-actions full"><button className="button secondary" type="button" onClick={() => setDialogOpen(false)}>取消</button><button className="button primary" disabled={saving}>{saving ? "正在保存" : "保存小组"}</button></div></form></AdminDialog>}
  </div>;
}
