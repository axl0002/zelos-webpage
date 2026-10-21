import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import SafetyReviewDashboard from "@/components/safety-review-dashboard";

export const dynamic = "force-dynamic";
export const metadata = {title: "Upload safety · Zelos admin"};

export default async function SafetyReviewPage() {
  const auth = await requireAdmin();
  if (auth.response?.status === 503)
    return (
      <div className="workspace-state">
        <section className="review-panel">
          <h1>Could not load upload review.</h1>
          <p role="alert" className="error">The service is temporarily unavailable. Please try again.</p>
          <a className="button primary" href="/admin/safety">Try again</a>
        </section>
      </div>
    );
  if (auth.response)
    redirect(auth.response.status === 401 ? "/admin/login" : "/admin/login?error=access");
  return <SafetyReviewDashboard />;
}
