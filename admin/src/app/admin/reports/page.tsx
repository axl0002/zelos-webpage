import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import ModerationReportsDashboard from "@/components/moderation-reports-dashboard";
export const dynamic = "force-dynamic";
export default async function ReportsPage() {
  const auth = await requireAdmin();
  if (auth.response?.status === 503) return <main className="login-wrap"><section className="login-card">
    <h1>Could not load reports.</h1><p role="alert">The service is temporarily unavailable. Please try again.</p>
    <a className="button primary" href="/admin/reports">Try again</a>
  </section></main>;
  if (auth.response) redirect(auth.response.status === 401 ? "/admin/login" : "/admin/login?error=access");
  return <ModerationReportsDashboard />;
}
