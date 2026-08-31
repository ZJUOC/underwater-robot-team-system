import type { Metadata } from "next";
import { RovLanding } from "./components/landing/RovLanding";

export const metadata: Metadata = {
  title: "ABYSS ROV-01 | 水下机器人协会",
  description: "面向深海探索的模块化水下机器人与团队协作平台。",
};

export default function Home() {
  return <RovLanding />;
}
