"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Anchor, Brain, CaretDown, ClipboardText, Database, Files, GearSix, House,
  IdentificationCard, ListChecks, MagnifyingGlass, UsersThree,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

const nav: { href: string; label: string; icon: Icon }[] = [
  { href: "/research", label: "调研审核", icon: Files },
  { href: "/applications", label: "纳新档案", icon: ClipboardText },
  { href: "/members", label: "成员中心", icon: IdentificationCard },
  { href: "/interviews", label: "面试管理", icon: UsersThree },
  { href: "/evidence", label: "证据审核", icon: Brain },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const isPublicRoute = pathname === "/" || pathname === "/login";
  useEffect(() => {
    if (isPublicRoute) { setAuthReady(true); return; }
    if (!window.localStorage.getItem("robot_team_token")) { router.replace("/login"); return; }
    setAuthReady(true);
  }, [isPublicRoute, router]);
  if (isPublicRoute) return <>{children}</>;
  if (!authReady) return <div className="auth-loading" aria-label="正在检查登录状态" />;
  function logout() {
    window.localStorage.removeItem("robot_team_token");
    window.localStorage.removeItem("robot_team_user");
    router.replace("/login");
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Anchor size={20} weight="bold" /></div>
          <div><strong>ROV TEAM</strong><span>成员协作系统</span></div>
        </div>
        <nav className="primary-nav" aria-label="主要导航">
          <p className="nav-group-label">人员与面试</p>
          {nav.map(({ href, label, icon: NavIcon }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
            return <Link key={href} href={href} className={active ? "nav-item active" : "nav-item"}>
              <NavIcon size={18} weight={active ? "fill" : "regular"} />
              <span>{label}</span>
            </Link>;
          })}
          <p className="nav-group-label later">后续阶段</p>
          <div className="nav-item disabled"><House size={18} /><span>团队工作台</span><small>Later</small></div>
          <div className="nav-item disabled"><ListChecks size={18} /><span>项目与任务</span><small>Phase 2</small></div>
          <div className="nav-item disabled"><Database size={18} /><span>智能组队</span><small>Phase 4</small></div>
        </nav>
        <div className="sidebar-footer">
          <GearSix size={18} /><span>系统设置</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="search"><MagnifyingGlass size={18} /><span>搜索纳新档案、成员、面试</span><kbd>⌘ K</kbd></div>
          <button className="user-menu" type="button" onClick={logout} title="退出登录"><span className="avatar">管</span><span>开发管理员</span><CaretDown size={14} /></button>
        </header>
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
