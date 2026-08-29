"use client";

import { Brain, Check, Funnel, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Evidence, EvidenceStatus } from "../types";
import { EmptyState, ErrorState, LoadingState } from "../components/States";

const labels: Record<EvidenceStatus, string> = { pending: "待审核", accepted: "已接受", rejected: "已拒绝", modified: "已修改" };

export default function EvidencePage() {
  const [rows, setRows] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | EvidenceStatus>("all");
  const [working, setWorking] = useState<number | null>(null);
  const load = useCallback(() => { setLoading(true); setError(""); api<Evidence[]>("/api/evidence").then(setRows).catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  useEffect(load, [load]);
  const visible = useMemo(() => filter === "all" ? rows : rows.filter(r => r.status === filter), [rows, filter]);
  async function review(id: number, status: "accepted" | "rejected") {
    setWorking(id); setError("");
    try { await api(`/api/evidence/${id}`, { method: "PATCH", body: JSON.stringify({ status, review_note: status === "accepted" ? "证据与原始逐字稿一致" : "当前证据不足以支持该判断", reviewed_by: "开发管理员" }) }); load(); }
    catch (e) { setError(e instanceof Error ? e.message : "审核失败"); }
    finally { setWorking(null); }
  }
  return <div className="page">
    <div className="page-heading"><div><p className="eyebrow">Evidence Engine</p><h1>证据审核台</h1><p>AI 只提出待审核证据，人工决定它是否进入当前画像。</p></div></div>
    <div className="filter-tabs"><Funnel size={16} />{(["all", "pending", "accepted", "rejected"] as const).map(value => <button className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)}>{value === "all" ? "全部" : labels[value]}<span>{value === "all" ? rows.length : rows.filter(r => r.status === value).length}</span></button>)}</div>
    {error && <ErrorState message={error} retry={load} />}
    {loading ? <LoadingState rows={5} /> : visible.length === 0 ? <EmptyState title="当前没有 Evidence" description="先运行一次面试分析，AI 证据会出现在这里。" /> : <div className="review-list">{visible.map(item => <article className="review-item" key={item.id}>
      <div className="review-icon"><Brain size={20} /></div><div className="review-body"><div className="review-title"><span className={`status-chip ${item.status}`}>{labels[item.status]}</span><h2>{item.dimension}</h2><small>Member #{item.member_id}</small></div><p className="review-description">{item.description}</p><p className="reasoning"><strong>推理摘要</strong>{item.reasoning_summary}</p><div className="evidence-stats"><span>来源 <b>{item.source_type} #{item.source_id}</b></span><span>强度 <b>{Math.round(item.strength * 100)}%</b></span><span>可信度 <b>{Math.round(item.confidence * 100)}%</b></span><span>生成时间 <b>{new Date(item.created_at).toLocaleString("zh-CN")}</b></span></div></div>
      <div className="review-actions">{item.status === "pending" ? <><button className="button accept" type="button" disabled={working === item.id} onClick={() => review(item.id, "accepted")}><Check size={16} /> 接受</button><button className="button reject" type="button" disabled={working === item.id} onClick={() => review(item.id, "rejected")}><X size={16} /> 拒绝</button></> : <span className="reviewed-label">{labels[item.status]}</span>}</div>
    </article>)}</div>}
  </div>;
}
