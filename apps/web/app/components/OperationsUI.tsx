"use client";

import { DownloadSimple, FileText, X } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { downloadApiFile } from "../lib/api";
import type { OperationsFile } from "../types";

export function AdminDialog({ title, description, close, children, wide = false }: { title: string; description: string; close: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={close}>
    <div className={`modal ${wide ? "operations-wide-modal" : ""}`} role="dialog" aria-modal="true" aria-labelledby="operations-dialog-title" onMouseDown={event => event.stopPropagation()}>
      <div className="modal-heading"><div><h2 id="operations-dialog-title">{title}</h2><p>{description}</p></div><button className="icon-button" type="button" onClick={close} aria-label="关闭"><X size={18} /></button></div>
      {children}
    </div>
  </div>;
}

export function OperationsFileList({ files }: { files: OperationsFile[] }) {
  if (files.length === 0) return <div className="operations-inline-empty"><FileText size={23} /><span>尚未上传资料</span></div>;
  return <div className="operations-file-list">{files.map(file => <article key={file.id}>
    <FileText size={20} /><div><strong>{file.title || file.original_name}</strong><small>{file.kind || "资料"} · {formatBytes(file.size)} · {file.original_name}</small></div>
    <button className="icon-button" type="button" title="下载资料" onClick={() => void downloadApiFile(`/api/operations/files/${file.id}`, file.original_name).catch(error => window.alert(error.message))}><DownloadSimple size={17} /></button>
  </article>)}</div>;
}

export function formatDate(value: string | null | undefined, withTime = true) {
  if (!value) return "未设置";
  return new Date(value).toLocaleString("zh-CN", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" });
}

export function localDateTimeValue(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
}

function formatBytes(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
