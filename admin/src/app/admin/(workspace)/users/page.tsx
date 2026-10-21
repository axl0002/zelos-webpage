import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import AdminUsersDashboard from "@/components/admin-users-dashboard";
export const dynamic = "force-dynamic";
export const metadata = {title: "Users · Zelos admin"};
export default async function UsersPage() {
  const auth = await requireAdmin();
  if (auth.response?.status === 503) return <div className="workspace-state"><section className="review-panel">
    <h1>Could not load users.</h1><p role="alert">The service is temporarily unavailable. Please try again.</p>
    <a className="button primary" href="/admin/users">Try again</a>
  </section></div>;
  if (auth.response) redirect(auth.response.status === 401 ? "/admin/login" : "/admin/login?error=access");
  return <AdminUsersDashboard />;
}
