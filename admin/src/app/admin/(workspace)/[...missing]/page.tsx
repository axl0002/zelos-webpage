import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
export const dynamic = "force-dynamic";
export default async function MissingAdminPage() {
  const auth = await requireAdmin();
  if (auth.response?.status === 503) return <section className="review-panel workspace-state"><h1>Could not load this page.</h1><p role="alert">The service is temporarily unavailable. Choose another page or try again shortly.</p></section>;
  if (auth.response) redirect(auth.response.status === 401 ? "/admin/login" : "/admin/login?error=access");
  notFound();
}
