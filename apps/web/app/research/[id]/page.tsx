"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, Brain, CheckCircle, DownloadSimple, FileText, FloppyDisk, Sparkle,
  UploadSimple, UserCircleCheck, Warning, X,
} from "@phosphor-icons/react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api, apiBlob, apiForm } from "../../lib/api";
import type {
  CandidateResearchAssessment, ResearchContribution, ResearchRecommendation,
  ResearchTeamDetail, ResearchTeamMember,
} from "../../types";
import { ErrorState, LoadingState } from "../../components/States";

type ModalName = "files" | "contribution" | null;

const recommendationLabels: Record<string, string> = {
  recommend_join: "建议加入", follow_up: "建议补充问答",
  insufficient_evidence: "个人贡献证据不足", not_recommended: "暂不建议",
  needs_review: "需要复核",
};

const statusLabels: Record<string, string> = {
  assigned: "待开始", in_progress: "准备材料", submitted: "待分析",
  analyzed: "已分析", review_required: "待人工复核", decided: "已完成",
};

export default function ResearchTeamPage() {
  const params = useParams<{ id: string }>();
  const teamId = Number(params.id);
  const [data, setData] = useState<ResearchTeamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<ModalName>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError("");
    api<ResearchTeamDetail>(`/api/research/teams/${teamId}`)
      .then(value => { setData(value); setSelectedMemberId(current => current ?? value.members[0]?.member_id ?? null); })
      .catch(reason => setError(reason instanceof Error ? reason.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [teamId]);
  useEffect(load, [load]);

  const selectedMember = data?.members.find(item => item.member_id === selectedMemberId) ?? null;
  const selectedContribution = useMemo(() => {
    if (!data?.submission || !selectedMember) return null;
    return data.submission.contributions.find(item => item.team_member_id === selectedMember.id) ?? null;
  }, [data, selectedMember]);
  const selectedAssessment = data?.assessment?.candidates.find(item => item.member_id === selectedMemberId) ?? null;
  const selectedReview = data?.reviews.find(item => item.member_id === selectedMemberId) ?? null;
  const selectedDecision = data?.decisions.find(item => item.member_id === selectedMemberId) ?? null;

  async function runAction(path: string) {
    setWorking(true); setError("");
    try { await api(path, { method: "POST" }); load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败"); }
    finally { setWorking(false); }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setWorking(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await apiForm(`/api/research/teams/${teamId}/files`, form);
      setModal(null); load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "上传失败"); }
    finally { setWorking(false); }
  }

  async function saveContribution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMember) return;
    setWorking(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api(`/api/research/teams/${teamId}/contributions/${selectedMember.member_id}`, { method: "PUT", body: JSON.stringify({
        role_summary: form.get("role_summary"), contribution: form.get("contribution"),
        key_findings: form.get("key_findings"), challenges: form.get("challenges"),
        source_validation: form.get("source_validation"), preferred_direction: form.get("preferred_direction"),
        peer_confirmation: {},
      }) });
      setModal(null); load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败"); }
    finally { setWorking(false); }
  }

  async function saveReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMember) return;
    setWorking(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api(`/api/research/teams/${teamId}/reviews/${selectedMember.member_id}`, { method: "PUT", body: JSON.stringify({
        recommendation: form.get("recommendation"),
        criteria_scores: {
          technical_understanding: Number(form.get("technical_understanding")),
          research_ability: Number(form.get("research_ability")),
          contribution: Number(form.get("contribution_score")),
          responsibility: Number(form.get("responsibility")),
        },
        summary: form.get("summary"), concerns: form.get("concerns"),
        follow_up_questions: String(form.get("questions") ?? "").split("\n").map(value => value.trim()).filter(Boolean),
        submit: true,
      }) });
      load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "提交复核失败"); }
    finally { setWorking(false); }
  }

  async function saveDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMember) return;
    setWorking(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api(`/api/research/teams/${teamId}/decisions/${selectedMember.member_id}`, { method: "PUT", body: JSON.stringify({ status: form.get("status"), reason: form.get("reason") }) });
      load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "确认结论失败"); }
    finally { setWorking(false); }
  }

  async function download(path: string, filename: string) {
    try {
      const blob = await apiBlob(path);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "下载失败"); }
  }

  if (loading) return <LoadingState rows={8} />;
  if (!data) return <ErrorState message={error || "调研小队不存在"} retry={load} />;

  const readyToSubmit = data.file_count > 0 && data.contribution_count === 3;
  const editable = data.status !== "decided";
  return <div className="page research-detail-page">
    <Link className="back-link" href="/research"><ArrowLeft size={15} /> 返回审核队列</Link>
    <div className="research-detail-header">
      <div><div className="research-title-line"><span className={`status-chip ${data.status === "review_required" ? "pending" : data.status === "decided" ? "accepted" : "active"}`}>{statusLabels[data.status] ?? data.status}</span><p>{data.task.title}</p></div><h1>{data.name}</h1><p>团队成果占 40 分，个人贡献占 60 分；最终结论逐人确认。</p></div>
      <div className="heading-actions">
        {editable && <button className="button secondary" type="button" onClick={() => setModal("files")}><UploadSimple size={17} /> 上传材料</button>}
        {data.status === "in_progress" && <button className="button primary" type="button" disabled={!readyToSubmit || working} onClick={() => runAction(`/api/research/teams/${teamId}/submit`)}><CheckCircle size={17} /> 提交材料</button>}
        {data.status === "submitted" && <button className="button primary" type="button" disabled={working} onClick={() => runAction(`/api/research/teams/${teamId}/analyze`)}><Sparkle size={17} weight="fill" /> 开始分析</button>}
        {data.assessment && <button className="button secondary" type="button" onClick={() => download(`/api/research/teams/${teamId}/export`, `${data.name}-审核结果.csv`)}><DownloadSimple size={17} /> 导出</button>}
      </div>
    </div>

    <section className="research-stage-strip">
      <Stage done={data.file_count > 0} label="团队材料" value={`${data.file_count} 份`} />
      <Stage done={data.contribution_count === 3} label="个人说明" value={`${data.contribution_count}/3`} />
      <Stage done={Boolean(data.assessment)} label="AI 分析" value={data.assessment ? `${data.assessment.team_score}/40` : "未运行"} />
      <Stage done={data.decision_count === 3} label="人工决策" value={`${data.decision_count}/3`} />
    </section>

    {error && <ErrorState message={error} retry={load} />}

    <div className="research-workbench">
      <div className="research-workbench-main">
        <section className="panel research-material-panel">
          <div className="panel-heading"><div><h2>团队提交材料</h2><p>原始文件私有保存，解析内容按页或工作表定位。</p></div><span className="status-chip">{data.file_count} 份</span></div>
          {!data.submission?.files.length ? <div className="research-inline-empty"><FilesIcon /><strong>尚未上传材料</strong><p>请先上传团队调研报告，随后补充结构图、来源清单和过程记录。</p></div> : <div className="research-file-list">{data.submission.files.map(file => <article key={file.id}>
            <div className="research-file-title"><FileText size={19} /><div><strong>{file.original_name}</strong><small>{kindLabel(file.kind)} · {formatBytes(file.size)}</small></div><span className={`status-chip ${file.extraction_status === "failed" ? "rejected" : "active"}`}>{file.extraction_report.status_label}</span><button className="icon-button" type="button" title="下载原始材料" onClick={() => download(`/api/research/files/${file.id}/content`, file.original_name)}><DownloadSimple size={17} /></button></div>
            {file.segments.slice(0, 2).map((segment, index) => <div className="research-segment" key={`${segment.locator}-${index}`}><span>{segment.locator}</span><p>{segment.text.slice(0, 260)}{segment.text.length > 260 ? "…" : ""}</p></div>)}
          </article>)}</div>}
        </section>

        <section className="panel research-analysis-panel">
          <div className="panel-heading"><div><h2>团队成果分析</h2><p>只依据提交材料生成，引用不匹配的结论会被系统丢弃。</p></div>{data.assessment && <strong className="research-score">{data.assessment.team_score}<small>/40</small></strong>}</div>
          {!data.assessment ? <div className="research-inline-empty"><Brain size={30} /><strong>等待运行分析</strong><p>三份个人说明和团队报告提交后，系统会分别生成团队与个人评价。</p></div> : <>
            <p className="research-analysis-summary">{data.assessment.summary}</p>
            <div className="research-criteria-grid">{data.assessment.criteria.map(item => <CriterionCard item={item} key={item.key} />)}</div>
            {data.assessment.missing_information.length > 0 && <div className="research-warning-box"><Warning size={18} /><div><strong>需要人工留意</strong>{data.assessment.missing_information.map(item => <p key={item}>{item}</p>)}</div></div>}
          </>}
        </section>
      </div>

      <aside className="research-review-aside">
        <section className="panel research-member-panel">
          <div className="panel-heading"><div><h2>逐人评价</h2><p>团队报告不能代替个人贡献证据。</p></div></div>
          <div className="research-member-tabs">{data.members.map(member => {
            const assessment = data.assessment?.candidates.find(item => item.member_id === member.member_id);
            const decision = data.decisions.find(item => item.member_id === member.member_id);
            return <button type="button" className={member.member_id === selectedMemberId ? "active" : ""} onClick={() => setSelectedMemberId(member.member_id)} key={member.member_id}>
              <span className="member-avatar">{member.name.slice(0, 1)}</span><span><strong>{member.name}{member.is_leader ? " · 队长" : ""}</strong><small>{member.role_summary}</small></span>{decision ? <CheckCircle size={17} weight="fill" /> : assessment ? <b>{assessment.total_score}</b> : null}
            </button>;
          })}</div>
        </section>

        {selectedMember && <>
          <section className="panel research-person-card">
            <div className="research-person-heading"><div><p className="eyebrow">Candidate</p><h2>{selectedMember.name}</h2><span>{selectedMember.major} · {selectedMember.desired_department || "方向待确认"}</span></div>{editable && <button className="button secondary" type="button" onClick={() => setModal("contribution")}><FloppyDisk size={15} /> {selectedContribution ? "编辑贡献说明" : "填写贡献说明"}</button>}</div>
            {selectedContribution ? <div className="research-contribution-preview"><strong>{selectedContribution.role_summary}</strong><p>{selectedContribution.contribution}</p><small>方向：{selectedContribution.preferred_direction || "待确认"}</small></div> : <div className="research-contribution-missing"><Warning size={17} />尚未提交个人贡献说明</div>}
            {selectedAssessment && <CandidateAssessmentView assessment={selectedAssessment} />}
          </section>

          {data.assessment && <section className="panel research-form-panel">
            <h2>人工复核</h2><p>核对个人是否真正理解负责部分，不直接采纳 AI 建议。</p>
            {selectedReview?.status === "submitted" ? <div className="research-submitted-review"><CheckCircle size={21} weight="fill" /><div><strong>{recommendationLabels[selectedReview.recommendation]}</strong><p>{selectedReview.summary}</p><small>{selectedReview.reviewer_name} 已提交</small></div></div> : <ReviewForm assessment={selectedAssessment} working={working} submit={saveReview} />}
          </section>}

          {selectedReview?.status === "submitted" && <section className="panel research-form-panel decision-panel">
            <h2>最终人工结论</h2><p>结论只作用于当前候选人，不按小队整体一刀切。</p>
            {selectedDecision ? <div className="research-decision-result"><UserCircleCheck size={22} /><div><strong>{recommendationLabels[selectedDecision.status]}</strong><p>{selectedDecision.reason}</p><small>{selectedDecision.decider_name} · {new Date(selectedDecision.decided_at).toLocaleString("zh-CN")}</small></div></div> : <DecisionForm working={working} submit={saveDecision} defaultValue={selectedReview.recommendation as ResearchRecommendation} />}
          </section>}
        </>}
      </aside>
    </div>

    {modal === "files" && <Dialog title="上传调研材料" description="支持 PDF、Word、PPT、Excel、文本和图片；单文件最大 15 MB。" close={() => setModal(null)}><form className="form-grid" onSubmit={upload}>
      <label className="full"><span>材料类型</span><select name="kind" defaultValue="team_report"><option value="team_report">团队调研报告</option><option value="architecture">系统结构图</option><option value="sources">参考资料清单</option><option value="process">分工与过程记录</option><option value="other">其他补充材料</option></select></label>
      <label className="full research-file-input"><UploadSimple size={24} /><span>选择一个或多个文件</span><input name="files" type="file" multiple required accept=".xlsx,.xls,.csv,.pdf,.docx,.pptx,.txt,.md,.json,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff" /></label>
      <div className="form-actions full"><button className="button secondary" type="button" onClick={() => setModal(null)}>取消</button><button className="button primary" disabled={working}>{working ? "正在解析" : "上传并解析"}</button></div>
    </form></Dialog>}

    {modal === "contribution" && selectedMember && <Dialog wide title={`${selectedMember.name}的个人贡献说明`} description="个人说明用于区分团队共同成果与个人实际表现。" close={() => setModal(null)}><ContributionForm member={selectedMember} value={selectedContribution} working={working} submit={saveContribution} close={() => setModal(null)} /></Dialog>}
  </div>;
}

function Stage({ done, label, value }: { done: boolean; label: string; value: string }) {
  return <article className={done ? "done" : ""}><span>{done ? <CheckCircle size={18} weight="fill" /> : <i />}</span><div><small>{label}</small><strong>{value}</strong></div></article>;
}

function CriterionCard({ item }: { item: { label: string; score: number; max_score: number; confidence: number; reasoning: string; evidence: { filename: string; locator: string; quote: string }[] } }) {
  const ratio = Math.round(item.score / item.max_score * 100);
  return <article><div><strong>{item.label}</strong><span>{item.score}/{item.max_score}</span></div><div className="research-score-track"><i style={{ width: `${ratio}%` }} /></div><p>{item.reasoning}</p>{item.evidence.slice(0, 1).map((evidence, index) => <blockquote key={index}>“{evidence.quote}”<small>{evidence.filename} · {evidence.locator}</small></blockquote>)}</article>;
}

function CandidateAssessmentView({ assessment }: { assessment: CandidateResearchAssessment }) {
  return <div className="candidate-assessment-view"><div className="candidate-score-line"><div><span>个人材料</span><strong>{assessment.individual_score}<small>/60</small></strong></div><div><span>综合参考</span><strong>{assessment.total_score}<small>/100</small></strong></div><div><span>贡献可信度</span><strong>{Math.round(assessment.contribution_confidence * 100)}<small>%</small></strong></div></div><p>{assessment.summary}</p><div className="candidate-criteria-list">{assessment.criteria.map(item => <div key={item.key}><span>{item.label}</span><b>{item.score}/{item.max_score}</b></div>)}</div>{assessment.suggested_questions.length > 0 && <div className="candidate-questions"><strong>建议追问</strong>{assessment.suggested_questions.map(item => <p key={item}>{item}</p>)}</div>}</div>;
}

function ReviewForm({ assessment, working, submit }: { assessment: CandidateResearchAssessment | null; working: boolean; submit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <form className="research-review-form" onSubmit={submit}><div className="research-score-inputs">{[["technical_understanding", "技术理解"], ["research_ability", "调研能力"], ["contribution_score", "个人贡献"], ["responsibility", "责任意识"]].map(([name, label]) => <label key={name}><span>{label}</span><select name={name} defaultValue="4"><option value="5">5 · 明确优秀</option><option value="4">4 · 较好</option><option value="3">3 · 基本符合</option><option value="2">2 · 证据较弱</option><option value="1">1 · 不符合</option></select></label>)}</div><label><span>人工建议</span><select name="recommendation" defaultValue={assessment?.recommendation ?? "follow_up"}><option value="recommend_join">建议加入</option><option value="follow_up">建议补充问答</option><option value="insufficient_evidence">个人贡献证据不足</option><option value="not_recommended">暂不建议</option></select></label><label><span>审核理由</span><textarea name="summary" required placeholder="说明你核对了哪些材料，以及判断依据。" /></label><label><span>风险与疑问</span><textarea name="concerns" /></label><label><span>建议追问（每行一个）</span><textarea name="questions" defaultValue={assessment?.suggested_questions.join("\n")} /></label><button className="button primary" disabled={working}>{working ? "正在提交" : "提交人工复核"}</button></form>;
}

function DecisionForm({ working, submit, defaultValue }: { working: boolean; submit: (event: FormEvent<HTMLFormElement>) => void; defaultValue: ResearchRecommendation }) {
  return <form className="research-review-form" onSubmit={submit}><label><span>最终结论</span><select name="status" defaultValue={defaultValue}><option value="recommend_join">建议加入</option><option value="follow_up">建议补充问答</option><option value="insufficient_evidence">个人贡献证据不足</option><option value="not_recommended">暂不建议</option></select></label><label><span>决策理由</span><textarea name="reason" required placeholder="记录最终人工判断依据。" /></label><button className="button primary" disabled={working}>{working ? "正在确认" : "确认最终结论"}</button></form>;
}

function ContributionForm({ member, value, working, submit, close }: { member: ResearchTeamMember; value: ResearchContribution | null; working: boolean; submit: (event: FormEvent<HTMLFormElement>) => void; close: () => void }) {
  return <form className="form-grid" onSubmit={submit}><label className="full"><span>团队分工</span><input name="role_summary" defaultValue={value?.role_summary ?? member.role_summary} required /></label><label className="full"><span>我的实际贡献</span><textarea name="contribution" defaultValue={value?.contribution} required /></label><label className="full"><span>关键结论</span><textarea name="key_findings" defaultValue={value?.key_findings} /></label><label><span>遇到的困难</span><textarea name="challenges" defaultValue={value?.challenges} /></label><label><span>如何验证来源</span><textarea name="source_validation" defaultValue={value?.source_validation} /></label><label className="full"><span>最感兴趣的技术方向</span><input name="preferred_direction" defaultValue={value?.preferred_direction ?? member.desired_department} /></label><div className="form-actions full"><button className="button secondary" type="button" onClick={close}>取消</button><button className="button primary" disabled={working}>{working ? "正在保存" : "保存贡献说明"}</button></div></form>;
}

function Dialog({ title, description, close, children, wide = false }: { title: string; description: string; close: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={close}><div className={`modal ${wide ? "research-wide-modal" : ""}`} role="dialog" aria-modal="true" aria-labelledby="research-detail-dialog-title" onMouseDown={event => event.stopPropagation()}><div className="modal-heading"><div><h2 id="research-detail-dialog-title">{title}</h2><p>{description}</p></div><button className="icon-button" type="button" onClick={close} aria-label="关闭"><X size={18} /></button></div>{children}</div></div>;
}

function FilesIcon() { return <FileText size={31} />; }
function kindLabel(value: string) { return ({ team_report: "团队报告", architecture: "系统结构图", sources: "来源清单", process: "过程记录", other: "补充材料" } as Record<string, string>)[value] ?? value; }
function formatBytes(size: number) { return size > 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`; }
