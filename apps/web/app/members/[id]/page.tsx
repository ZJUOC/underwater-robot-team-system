"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUp, CalendarBlank, CaretRight, CheckCircle, Clock, Minus, ShieldCheck, TrendUp } from "@phosphor-icons/react";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import type { Evidence, MemberDetail, MemberTag } from "../../types";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";

const statusName = { pending: "待审核", accepted: "已接受", rejected: "已拒绝", modified: "已修改" };

export default function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const load = useCallback(() => { setError(""); api<MemberDetail>(`/api/members/${id}`).then(setMember).catch(e => setError(e.message)); }, [id]);
  useEffect(load, [load]);
  const selectedTag = member?.tags.find(tag => tag.dimension === selected);
  const selectedEvidence = useMemo(() => member?.evidence.filter(item => item.dimension === selected) ?? [], [member, selected]);

  if (error) return <div className="page"><ErrorState message={error} retry={load} /></div>;
  if (!member) return <div className="page"><LoadingState rows={6} /></div>;

  return <div className="page member-detail-page">
    <Link href="/members" className="back-link"><ArrowLeft size={16} /> 返回成员中心</Link>
    <header className="profile-header">
      <div className="profile-identity"><span className="profile-avatar">{member.name.slice(0,1)}</span><div><div className="profile-name-line"><h1>{member.name}</h1><span className="status-chip active">{member.status}</span></div><p>{member.major} / {member.student_id} / {member.department}</p></div></div>
      <div className="profile-meta"><div><span>部门志愿</span><strong>{member.desired_department}</strong></div><div><span>每周投入</span><strong>{member.weekly_commitment}</strong></div><div><span>联系方式</span><strong>{member.phone_masked}</strong></div></div>
    </header>
    <div className="profile-layout">
      <div className="profile-main">
        <section className="panel profile-section">
          <div className="panel-heading"><div><h2>能力画像</h2><p>分数是当前聚合视图，点击维度查看 Evidence。</p></div><span className="method-note"><ShieldCheck size={16} /> 来源加权</span></div>
          {member.tags.length === 0 ? <EmptyState title="还没有能力画像" description="分析一次面试后，这里会显示可追溯的能力维度。" /> : <div className="capability-list">
            {member.tags.map(tag => <CapabilityRow key={tag.id} tag={tag} onClick={() => setSelected(tag.dimension)} />)}
          </div>}
        </section>
        <section className="panel profile-section">
          <div className="panel-heading"><div><h2>原始 Evidence</h2><p>按时间保留，不因人工拒绝而删除。</p></div><Link href="/evidence" className="text-link">进入审核台</Link></div>
          {member.evidence.length === 0 ? <EmptyState title="暂无 Evidence" description="Mock 面试已经准备好，进入面试管理即可运行分析。" /> : <div className="evidence-list">
            {member.evidence.map(item => <EvidenceRow key={item.id} item={item} />)}
          </div>}
        </section>
      </div>
      <aside className="profile-aside">
        <section className="panel goals-panel"><h2>方向与目标</h2><div className="info-block"><span>技术方向</span><div className="tags">{member.interests.map(item => <span key={item}>{item}</span>)}</div></div><div className="info-block"><span>近期学习目标</span><div className="goal-list">{member.learning_goals.map(item => <div key={item}><CheckCircle size={16} />{item}</div>)}</div></div><div className="info-block"><span>长期目标</span><p>{member.long_term_goal}</p></div></section>
        <section className="panel timeline-panel"><h2>成长时间线</h2>{member.timeline.map((item, index) => <div className="timeline-item" key={`${item.type}-${index}`}><span className="timeline-marker" /><div><time>{new Date(item.occurred_at).toLocaleDateString("zh-CN")}</time><strong>{item.title}</strong><small>来源 {item.source_id}</small></div></div>)}</section>
      </aside>
    </div>
    {selected && selectedTag && <div className="drawer-backdrop" role="presentation" onMouseDown={() => setSelected(null)}><aside className="evidence-drawer" role="dialog" aria-modal="true" onMouseDown={e => e.stopPropagation()}>
      <button className="drawer-close" type="button" onClick={() => setSelected(null)}><ArrowLeft size={16} /> 关闭</button>
      <p className="eyebrow">能力依据</p><h2>{selectedTag.dimension}</h2>
      <div className="drawer-score"><strong>{selectedTag.score.toFixed(1)}</strong><div><span>可信度 {Math.round(selectedTag.confidence * 100)}%</span><span>{selectedTag.evidence_count} 条证据</span></div></div>
      <div className="drawer-evidence">{selectedEvidence.map(item => <EvidenceRow key={item.id} item={item} />)}</div>
    </aside></div>}
  </div>;
}

function CapabilityRow({ tag, onClick }: { tag: MemberTag; onClick: () => void }) {
  return <button className="capability-row" type="button" onClick={onClick}>
    <div className="capability-name"><strong>{tag.dimension}</strong><span>{tag.trend === "up" ? <><ArrowUp size={13} /> 上升</> : <><Minus size={13} /> 稳定</>}</span></div>
    <strong className="capability-score">{tag.score.toFixed(1)}</strong>
    <div className="capability-evidence"><span>可信度 {Math.round(tag.confidence * 100)}%</span><small>{tag.evidence_count} 条证据</small></div>
    <CaretRight size={18} />
  </button>;
}

function EvidenceRow({ item }: { item: Evidence }) {
  return <article className="evidence-row"><div className="evidence-row-top"><div><span className="status-chip">{statusName[item.status]}</span><strong>{item.dimension}</strong></div><time><CalendarBlank size={14} /> {new Date(item.created_at).toLocaleDateString("zh-CN")}</time></div><p>{item.description}</p><div className="evidence-stats"><span>来源 <b>{item.source_type} #{item.source_id}</b></span><span>强度 <b>{Math.round(item.strength * 100)}%</b></span><span>可信度 <b>{Math.round(item.confidence * 100)}%</b></span></div><details><summary>查看推理摘要</summary><p>{item.reasoning_summary}</p></details></article>;
}
