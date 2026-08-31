import type { Metadata } from "next";
import { AppShell } from "./components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "ROV TEAM | 深海机器人协作系统",
  description: "水下机器人协会装备展示、成员画像与协作管理系统",
  openGraph: {
    title: "ABYSS ROV-01 | 水下机器人协会",
    description: "面向深海探索的模块化水下机器人与团队协作平台。",
    images: [{ url: "/og.png", width: 1672, height: 941, alt: "ABYSS ROV-01 深海机器人" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ABYSS ROV-01 | 水下机器人协会",
    description: "面向深海探索的模块化水下机器人与团队协作平台。",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><AppShell>{children}</AppShell></body></html>;
}
