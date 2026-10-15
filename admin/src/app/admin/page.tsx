import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import ReviewDashboard from "@/components/review-dashboard";
export const dynamic = "force-dynamic";
export default async function AdminHome() {
  const auth = await requireAdmin();
  if (auth.response?.status === 503)
    return (
      <main className="login-wrap">
        <section className="login-card">
          <h1>Could not load the review workspace.</h1>
          <p role="alert" className="error">
            The service is temporarily unavailable. Please try again.
          </p>
          <a className="button primary" href="/admin">
            Try again
          </a>
        </section>
      </main>
    );
  if (auth.response)
    redirect(auth.response.status === 401 ? "/admin/login" : "/admin/login?error=access");
  return (
    <ReviewDashboard
      boards={auth.context!.boards}
      email={auth.user!.email || "Admin"}
    />
  );
}
