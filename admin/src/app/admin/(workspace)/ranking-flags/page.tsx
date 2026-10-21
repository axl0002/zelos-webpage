import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import RankingFlagsDashboard from "@/components/ranking-flags-dashboard";
export const dynamic = "force-dynamic";
export const metadata = {title: "Ranking flags · Zelos admin"};
export default async function RankingFlagsPage() {
  const auth = await requireAdmin();
  if (auth.response?.status === 503) return <div className="workspace-state"><section className="review-panel">
    <h1>Could not load ranking flags.</h1><p role="alert">The service is temporarily unavailable.</p>
    <a className="button primary" href="/admin/ranking-flags">Try again</a>
  </section></div>;
  if (auth.response) redirect(auth.response.status === 401 ? "/admin/login" : "/admin/login?error=access");
  return <RankingFlagsDashboard />;
}
