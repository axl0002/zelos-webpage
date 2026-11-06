import {redirect} from "next/navigation";
import {requireAdmin} from "@/lib/require-admin";
import AdminScoreWeights from "@/components/admin-score-weights";
export const dynamic = "force-dynamic";
export const metadata = {title: "Scoring weights · Zelos admin"};
export default async function ScoringWeightsPage() {
  const auth = await requireAdmin();
  if (auth.response?.status === 503) return <section className="review-panel"><h1>Could not load scoring weights.</h1>
    <p role="alert">The service is temporarily unavailable.</p><a href="/admin/scoring-weights">Try again</a></section>;
  if (auth.response) redirect(auth.response.status === 401 ? "/admin/login" : "/admin/login?error=access");
  return <AdminScoreWeights/>;
}
