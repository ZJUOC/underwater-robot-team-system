const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== "undefined" ? window.localStorage.getItem("robot_team_token") : null;
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: "请求失败" }));
    throw new ApiError(payload.message ?? payload.detail ?? "请求失败", response.status);
  }
  return response.json();
}

export async function apiForm<T>(path: string, body: FormData): Promise<T> {
  const token = typeof window !== "undefined" ? window.localStorage.getItem("robot_team_token") : null;
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body,
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: "请求失败" }));
    throw new ApiError(payload.message ?? payload.detail ?? "请求失败", response.status);
  }
  return response.json();
}

export async function apiBlob(path: string): Promise<Blob> {
  const token = typeof window !== "undefined" ? window.localStorage.getItem("robot_team_token") : null;
  const response = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: "下载失败" }));
    throw new ApiError(payload.message ?? payload.detail ?? "下载失败", response.status);
  }
  return response.blob();
}
