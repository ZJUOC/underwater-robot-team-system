"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Anchor, Brain, CaretDown, ClipboardText, Database, Files, GearSix,
  IdentificationCard, ListChecks, MagnifyingGlass, UsersThree,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

const recruitmentNav: { href: string; label: string; icon: Icon }[] = [
  { href: "/research", label: "面试小组作业", icon: Files },
  { href: "/applications", label: "纳新档案", icon: ClipboardText },
  { href: "/interviews", label: "面试管理", icon: UsersThree },
  { href: "/evidence", label: "证据审核", icon: Brain },
];

type MobileSection = "recruitment" | "members" | "training" | "setp";

const projectNav = [
  { href: "/setp/projects/application", label: "项目申请与审核" },
  { href: "/setp/projects/progress", label: "项目进度管理与查看" },
  { href: "/setp/projects/midterm", label: "项目中期答辩" },
  { href: "/setp/projects/final", label: "结题答辩" },
  { href: "/setp/projects/budget", label: "经费管理" },
];

const operationNav: { key: "training" | "setp"; label: string; icon: Icon; items: { href: string; label: string; children?: { href: string; label: string }[] }[] }[] = [
  {
    key: "training", label: "任务与课程", icon: ListChecks,
    items: [
      { href: "/training/tasks", label: "平时任务管理" },
      { href: "/training/classes", label: "课时管理" },
      { href: "/training/attendance", label: "考勤管理" },
    ],
  },
  {
    key: "setp", label: "SETP", icon: Database,
    items: [
      { href: "/setp/teams", label: "组队管理" },
      { href: "/setp/projects/application", label: "项目管理", children: projectNav },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const pathSection: MobileSection = pathname.startsWith("/members") ? "members"
    : pathname.startsWith("/training") ? "training"
      : pathname.startsWith("/setp") ? "setp" : "recruitment";
  const [mobileSection, setMobileSection] = useState<MobileSection>(pathSection);
  const mobileProjectOpen = mobileSection === "setp" && pathname.startsWith("/setp/projects");
  const [authReady, setAuthReady] = useState(false);
  const isPublicRoute = pathname === "/" || pathname === "/login";
  useEffect(() => {
    if (isPublicRoute) { setAuthReady(true); return; }
    if (!window.localStorage.getItem("robot_team_token")) { router.replace("/login"); return; }
    setAuthReady(true);
  }, [isPublicRoute, router]);
  useEffect(() => setMobileSection(pathSection), [pathSection]);
  if (isPublicRoute) return <>{children}</>;
  if (!authReady) return <div className="auth-loading" aria-label="正在检查登录状态" />;
  function logout() {
    window.localStorage.removeItem("robot_team_token");
    window.localStorage.removeItem("robot_team_user");
    router.replace("/login");
  }
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileSection === "members" ? "single-row" : ""} ${mobileProjectOpen ? "has-third-row" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Anchor size={20} weight="bold" /></div>
          <div><strong>ROV TEAM</strong><span>成员协作系统</span></div>
        </div>
        <nav className="primary-nav" aria-label="主要导航">
          <div className={`nav-section nav-recruitment ${mobileSection === "recruitment" ? "mobile-open" : ""}`}>
            <button type="button" className={`nav-item nav-parent nav-parent-button ${recruitmentNav.some(({ href }) => pathname === href || pathname.startsWith(`${href}/`)) ? "active" : ""} ${mobileSection === "recruitment" ? "mobile-selected" : ""}`} onClick={() => setMobileSection("recruitment")} aria-expanded={mobileSection === "recruitment"}>
              <ClipboardText size={18} weight="fill" />
              <span>纳新管理</span>
            </button>
            <div className="nav-subnav">
              {recruitmentNav.map(({ href, label, icon: NavIcon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return <Link key={href} href={href} onClick={() => setMobileSection("recruitment")} className={active ? "nav-subitem active" : "nav-subitem"}>
                  <NavIcon size={15} weight={active ? "fill" : "regular"} />
                  <span>{label}</span>
                </Link>;
              })}
            </div>
          </div>
          <Link href="/members" onClick={() => setMobileSection("members")} className={`nav-item nav-member ${pathname === "/members" || pathname.startsWith("/members/") ? "active" : ""}`}>
            <IdentificationCard size={18} weight={pathname.startsWith("/members") ? "fill" : "regular"} />
            <span>成员中心</span>
          </Link>
          {operationNav.map(({ key, label, icon: NavIcon, items }) => {
            const sectionActive = items.some(item => pathname === item.href || pathname.startsWith(item.href.replace("/application", "")));
            return <div className={`nav-section operations-nav nav-${key} ${mobileSection === key ? "mobile-open" : ""}`} key={label}>
              <button type="button" className={`nav-item nav-parent nav-parent-button ${sectionActive ? "active" : ""} ${mobileSection === key ? "mobile-selected" : ""}`} onClick={() => setMobileSection(key)} aria-expanded={mobileSection === key}><NavIcon size={18} weight={sectionActive ? "fill" : "regular"} /><span>{label}</span></button>
              <div className="nav-subnav">
                {items.map(item => {
                  const active = item.children ? pathname.startsWith("/setp/projects/") : pathname === item.href;
                  return <div className="nav-subgroup" key={item.href}>
                    <Link href={item.href} onClick={() => setMobileSection(key)} className={active ? "nav-subitem active" : "nav-subitem"}><span>{item.label}</span></Link>
                    {item.children && <div className="nav-thirdnav">{item.children.map(child =>
                      <Link key={child.href} href={child.href} onClick={() => setMobileSection("setp")} className={pathname === child.href ? "nav-thirditem active" : "nav-thirditem"}>{child.label}</Link>
                    )}</div>}
                  </div>;
                })}
              </div>
            </div>;
          })}
          {mobileProjectOpen && <div className="mobile-thirdnav">{projectNav.map(child =>
            <Link key={child.href} href={child.href} className={pathname === child.href ? "nav-thirditem active" : "nav-thirditem"}>{child.label}</Link>
          )}</div>}
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
