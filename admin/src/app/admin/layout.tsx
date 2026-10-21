import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zelos · Admin",
  description: "Zelos administration and moderation workspace",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
