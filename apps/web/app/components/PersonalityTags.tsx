import { Brain, ShieldCheck } from "@phosphor-icons/react";
import type { CSSProperties } from "react";
import type { PersonalityProfile } from "../types";

export function PersonalityTags({ profile, limit = 3, empty = "待分析" }: { profile: PersonalityProfile; limit?: number; empty?: string }) {
  const tags = profile?.tags?.slice(0, limit) ?? [];
  if (tags.length === 0) return <small className="personality-empty">{empty}</small>;
  return <div className="personality-tags">{tags.map((tag) => <span
    className="personality-tag"
    key={tag.key}
    title={`${tag.dimension} / 信号强度 ${Math.round(tag.signal_score * 100)}% / 可信度 ${Math.round(tag.confidence * 100)}%`}
  ><i style={{ "--confidence": tag.confidence } as CSSProperties} />{tag.label}</span>)}</div>;
}

export function PersonalityProfilePanel({ profile }: { profile: PersonalityProfile }) {
  const tags = profile?.tags ?? [];
  return <section className="panel personality-profile-panel">
    <div className="panel-heading"><div><h2>人格标签</h2><p>从报名自述与面试语言中提取的初步协作倾向。</p></div><span className="method-note"><Brain size={16} /> Big Five 信号</span></div>
    {tags.length === 0 ? <div className="personality-insufficient"><Brain size={24} /><div><strong>语言材料不足</strong><p>补充开放式回答或完成面试后再分析，系统不会为了填满标签而猜测。</p></div></div> : <div className="personality-profile-grid">{tags.map((tag) => <article key={tag.key}>
      <div className="personality-card-heading"><span>{tag.dimension}</span><strong>{tag.label}</strong></div>
      <p>{tag.description}</p>
      <div className="personality-meter"><span style={{ width: `${Math.round(tag.signal_score * 100)}%` }} /></div>
      <small>信号强度 {Math.round(tag.signal_score * 100)}% / 可信度 {Math.round(tag.confidence * 100)}% / {tag.evidence_count} 条语言依据</small>
      <details><summary>查看来源</summary>{tag.evidence.map((item, index) => <p key={`${item.source}-${index}`}><b>{item.source}</b>{item.excerpt}</p>)}</details>
    </article>)}</div>}
    <div className="personality-notice"><ShieldCheck size={16} /><span>{profile?.notice || "人格标签只用于理解沟通与协作方式，不作为录取依据。"}</span></div>
  </section>;
}
