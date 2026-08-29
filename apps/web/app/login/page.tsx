"use client";

import { Anchor, ArrowRight, LockKey, ShieldCheck, User } from "@phosphor-icons/react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/api";

interface LoginResponse {
  access_token: string;
  expires_in: number;
  user: { display_name: string; role: string };
}

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await api<LoginResponse>("/api/auth/login", { method: "POST", body: JSON.stringify({ username: form.get("username"), password: form.get("password") }) });
      window.localStorage.setItem("robot_team_token", response.access_token);
      window.localStorage.setItem("robot_team_user", JSON.stringify(response.user));
      router.replace("/applications");
    } catch (e) { setError(e instanceof Error ? e.message : "登录失败"); }
    finally { setLoading(false); }
  }
  return <main className="login-page">
    <section className="login-brand-panel">
      <div className="login-brand"><span><Anchor size={24} weight="bold" /></span><div><strong>ROV TEAM</strong><small>成员协作系统</small></div></div>
      <div className="login-statement"><p className="eyebrow">Underwater Robotics</p><h1>理解成员，<br />不只评价成员。</h1><p>每个画像结论都能回到真实活动与 Evidence。</p></div>
      <div className="login-chain"><span>Raw Data</span><ArrowRight /><span>Evidence</span><ArrowRight /><span>Profile</span></div>
    </section>
    <section className="login-form-panel">
      <form className="login-form" onSubmit={submit}>
        <div className="login-form-heading"><span className="login-lock"><ShieldCheck size={22} /></span><h2>登录管理系统</h2><p>使用你的团队管理账号继续。</p></div>
        {error && <div className="login-error">{error}</div>}
        <label><span>用户名</span><div className="login-input"><User size={17} /><input name="username" defaultValue="admin" autoComplete="username" required /></div></label>
        <label><span>密码</span><div className="login-input"><LockKey size={17} /><input name="password" type="password" defaultValue="robot2026" autoComplete="current-password" required /></div></label>
        <button className="button primary login-submit" type="submit" disabled={loading}>{loading ? "正在验证" : "登录"}<ArrowRight size={17} /></button>
        <p className="login-hint">本地演示账号：admin / robot2026</p>
      </form>
    </section>
  </main>;
}
