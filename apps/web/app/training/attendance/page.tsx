"use client";

import { CalendarBlank, CheckCircle, ClockCountdown, FloppyDisk, UserMinus, UsersThree } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDate } from "../../components/OperationsUI";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { api } from "../../lib/api";
import type { AttendanceMember, CourseSession } from "../../types";

const statusLabels: Record<string, string> = { unmarked: "未登记", present: "出勤", late: "迟到", leave: "请假", absent: "缺勤" };

export default function AttendancePage() {
  const [sessions, setSessions] = useState<CourseSession[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [members, setMembers] = useState<AttendanceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const loadSessions = useCallback(() => {
    setLoading(true); setError("");
    api<CourseSession[]>("/api/operations/classes").then(rows => { setSessions(rows); setSelectedId(current => current ?? rows[0]?.id ?? null); })
      .catch(reason => setError(reason instanceof Error ? reason.message : "加载失败")).finally(() => setLoading(false));
  }, []);
  useEffect(loadSessions, [loadSessions]);
  useEffect(() => {
    if (!selectedId) { setMembers([]); return; }
    setLoading(true);
    api<{ session: CourseSession; members: AttendanceMember[] }>(`/api/operations/attendance/${selectedId}`)
      .then(payload => setMembers(payload.members)).catch(reason => setError(reason instanceof Error ? reason.message : "考勤加载失败"))
      .finally(() => setLoading(false));
  }, [selectedId]);
  const selected = useMemo(() => sessions.find(row => row.id === selectedId) ?? null, [sessions, selectedId]);
  const counts = useMemo(() => ({ present: members.filter(row => row.status === "present").length,
    exceptions: members.filter(row => ["late", "leave", "absent"].includes(row.status)).length,
    unmarked: members.filter(row => row.status === "unmarked").length }), [members]);

  async function saveMember(member: AttendanceMember) {
    if (!selectedId) return; setSavingId(member.id); setError("");
    try {
      await api(`/api/operations/attendance/${selectedId}`, { method: "PUT", body: JSON.stringify({ member_id: member.id, status: member.status, note: member.note }) });
      setMembers(current => current.map(row => row.id === member.id ? { ...row, checked_at: new Date().toISOString() } : row));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败"); }
    finally { setSavingId(null); }
  }

  return <div className="page operations-page">
    <div className="page-heading"><div><p className="eyebrow">Attendance Register</p><h1>考勤管理</h1><p>按课时登记正式成员出勤、迟到、请假和缺勤状态，并保留备注。</p></div></div>
    {sessions.length > 0 && <div className="attendance-session-picker"><label><CalendarBlank size={18} /><span>选择课时</span><select value={selectedId ?? ""} onChange={event => setSelectedId(Number(event.target.value))}>{sessions.map(session => <option value={session.id} key={session.id}>{formatDate(session.starts_at)} · {session.title}</option>)}</select></label>{selected && <div><strong>{selected.location || "地点待定"}</strong><small>{selected.duration_minutes} 分钟</small></div>}</div>}
    <section className="operations-metrics"><article><span>已出勤</span><strong>{counts.present}</strong><small>正常到课</small><CheckCircle size={22} /></article><article><span>异常记录</span><strong>{counts.exceptions}</strong><small>迟到 / 请假 / 缺勤</small><UserMinus size={22} /></article><article><span>未登记</span><strong>{counts.unmarked}</strong><small>等待管理员确认</small><ClockCountdown size={22} /></article></section>
    {error && <ErrorState message={error} retry={loadSessions} />}
    {loading ? <LoadingState rows={6} /> : sessions.length === 0 ? <EmptyState title="还没有可考勤课时" description="请先在“课时管理”创建课程安排。" /> : members.length === 0 ? <EmptyState title="还没有正式成员" description="成员转正后会自动出现在本课时的考勤名单中。" /> : <section className="panel attendance-panel"><div className="panel-heading"><div><h2>{selected?.title}</h2><p>{members.length} 名正式成员</p></div><UsersThree size={23} /></div><div className="attendance-table-wrap"><table className="data-table attendance-table"><thead><tr><th>成员</th><th>部门</th><th>状态</th><th>备注</th><th>登记</th></tr></thead><tbody>{members.map(member => <tr key={member.id}><td><div className="identity-cell"><span className="member-avatar">{member.name.slice(0, 1)}</span><div><strong>{member.name}</strong><small>{member.student_id}</small></div></div></td><td>{member.department || "待分配"}<small>{member.grade || "年级待定"}</small></td><td><select className={`attendance-status ${member.status}`} value={member.status} onChange={event => setMembers(current => current.map(row => row.id === member.id ? { ...row, status: event.target.value } : row))}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></td><td><input className="attendance-note" value={member.note} placeholder="可填写请假原因等" onChange={event => setMembers(current => current.map(row => row.id === member.id ? { ...row, note: event.target.value } : row))} /></td><td><button className="button secondary" type="button" disabled={savingId === member.id} onClick={() => saveMember(member)}><FloppyDisk size={15} /> {savingId === member.id ? "保存中" : "保存"}</button></td></tr>)}</tbody></table></div></section>}
  </div>;
}
