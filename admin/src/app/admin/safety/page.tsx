import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import SafetyReviewDashboard from "@/components/safety-review-dashboard";

export const dynamic = "force-dynamic";

export default async function SafetyReviewPage() {
  const auth = await requireAdmin();
  if (auth.response?.status === 503)
    return (
      <main className="login-wrap">
        <section className="login-card">
          <h1>Could not load upload review.</h1>
          <p role="alert" className="error">The service is temporarily unavailable. Please try again.</p>
          <a className="button primary" href="/admin/safety">Try again</a>
        </section>
      </main>
    );
  if (auth.response)
    redirect(auth.response.status === 401 ? "/admin/login" : "/admin/login?error=access");
  return <SafetyReviewDashboard email={auth.user!.email || "Admin"} />;
}
