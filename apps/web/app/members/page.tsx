"use client";

import Link from "next/link";
import { ArrowRight, Funnel, MagnifyingGlass, Plus, X } from "@phosphor-icons/react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Member } from "../types";
import { EmptyState, ErrorState, LoadingState } from "../components/States";
import { PersonalityTags } from "../components/PersonalityTags";

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => {
    setLoading(true); setError("");
    api<Member[]>("/api/members").then(setMembers).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  const filtered = useMemo(() => members.filter(m => [m.name, m.student_id, m.major, m.desired_department, ...(m.personality_profile?.tags?.flatMap(tag => [tag.label, tag.dimension]) ?? [])].join(" ").toLowerCase().includes(query.toLowerCase())), [members, query]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      await api<Member>("/api/members", { method: "POST", body: JSON.stringify({
        name: form.get("name"), student_id: form.get("student_id"), major: form.get("major"),
        grade: form.get("grade"), desired_department: form.get("desired_department"),
        role_title: form.get("role_title"),
        interests: String(form.get("interests") ?? "").split(/[、,，]/).map(v => v.trim()).filter(Boolean),
        learning_goals: String(form.get("learning_goals") ?? "").split(/[、,，]/).map(v => v.trim()).filter(Boolean),
        weekly_commitment: form.get("weekly_commitment"),
      }) });
      setOpen(false); load();
    } catch (e) { setError(e instanceof Error ? e.message : "创建失败"); }
    finally { setSaving(false); }
  }

  return <div className="page">
    <div className="page-heading"><div><p className="eyebrow">Club Members</p><h1>成员中心</h1><p>这里只管理已经进入社团的正式成员，与纳新报名档案分开维护。</p></div><button className="button primary" type="button" onClick={() => setOpen(true)}><Plus size={16} /> 添加正式成员</button></div>
    <div className="toolbar"><label className="table-search"><MagnifyingGlass size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索姓名、学号、专业或志愿" /></label><button className="button secondary" type="button"><Funnel size={16} /> 筛选</button><span className="result-count">{filtered.length} 位成员</span></div>
    {error && <ErrorState message={error} retry={load} />}
    {loading ? <LoadingState rows={5} /> : filtered.length === 0 ? <EmptyState title="没有匹配的正式成员" description="调整搜索条件，或添加第一位社团成员。" /> : <div className="data-table-wrap"><table className="data-table"><thead><tr><th>成员</th><th>专业 / 年级</th><th>人格标签</th><th>社团岗位</th><th>状态</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>
      {filtered.map(member => <tr key={member.id}><td><Link href={`/members/${member.id}`} className="identity-cell"><span className="member-avatar">{member.name.slice(0,1)}</span><span><strong>{member.name}</strong><small>{member.student_id}</small></span></Link></td><td><strong>{member.major}</strong><small>{member.grade} 级</small></td><td><PersonalityTags profile={member.personality_profile} empty="待补充材料" /></td><td><strong>{member.role_title || member.department || "待分配"}</strong><small>{member.department}</small></td><td><span className="status-chip active">{member.status}</span></td><td><Link href={`/members/${member.id}`} className="icon-link" aria-label={`查看${member.name}`}><ArrowRight size={18} /></Link></td></tr>)}
    </tbody></table></div>}
    {open && <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="new-member-title" onMouseDown={e => e.stopPropagation()}>
      <div className="modal-heading"><div><h2 id="new-member-title">添加正式成员</h2><p>用于已经通过纳新或直接加入社团的成员。</p></div><button className="icon-button" type="button" onClick={() => setOpen(false)}><X size={18} /></button></div>
      <form onSubmit={submit} className="form-grid">
        <label><span>姓名</span><input name="name" required /></label><label><span>学号</span><input name="student_id" required /></label>
        <label><span>专业</span><input name="major" required /></label><label><span>年级</span><input name="grade" defaultValue="2026" required /></label>
        <label className="full"><span>部门志愿</span><input name="desired_department" placeholder="例如：电控组" /></label>
        <label className="full"><span>社团岗位</span><input name="role_title" placeholder="例如：机械组骨干" /></label>
        <label className="full"><span>技术方向</span><input name="interests" placeholder="嵌入式、控制、ROS2" /><small>技术偏好与人格标签分开保存</small></label>
        <label className="full"><span>学习目标</span><input name="learning_goals" placeholder="STM32、系统联调" /><small>自我陈述会作为低权重信息保存</small></label>
        <label className="full"><span>每周投入</span><select name="weekly_commitment"><option>3-5h</option><option>5h以上</option><option>1-3h</option></select></label>
        <div className="form-actions full"><button className="button secondary" type="button" onClick={() => setOpen(false)}>取消</button><button className="button primary" type="submit" disabled={saving}>{saving ? "正在创建" : "创建成员"}</button></div>
      </form>
    </div></div>}
  </div>;
}
