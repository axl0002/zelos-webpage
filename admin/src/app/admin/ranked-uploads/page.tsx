import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import RankedUploadsDashboard from "@/components/ranked-uploads-dashboard";
export const dynamic = "force-dynamic";
export default async function RankedUploadsPage() {
  const auth = await requireAdmin();
  if (auth.response?.status === 503) return <main className="login-wrap"><section className="login-card">
    <h1>Could not load ranked uploads.</h1><p role="alert">The service is temporarily unavailable.</p>
    <a className="button primary" href="/admin/ranked-uploads">Try again</a>
  </section></main>;
  if (auth.response) redirect(auth.response.status === 401 ? "/admin/login" : "/admin/login?error=access");
  return <RankedUploadsDashboard />;
}
