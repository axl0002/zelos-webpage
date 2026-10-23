import type { Metadata } from "next";
import "./globals.css";

// Login also needs request-time rendering for its per-response script nonce.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Zelos · Admin",
  description: "Zelos administration and moderation workspace",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
