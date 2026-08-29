import { WarningCircle } from "@phosphor-icons/react/dist/ssr";

export function LoadingState({ rows = 4 }: { rows?: number }) {
  return <div className="skeleton-list" aria-label="正在加载">
    {Array.from({ length: rows }).map((_, index) => <div className="skeleton-row" key={index} />)}
  </div>;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="state-panel error-state"><WarningCircle size={28} />
    <div><strong>数据暂时不可用</strong><p>{message}</p></div>
    {retry && <button className="button secondary" type="button" onClick={retry}>重试</button>}
  </div>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="state-panel"><div><strong>{title}</strong><p>{description}</p></div></div>;
}
