import AdminWorkspace from "@/components/admin-workspace";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

// Verify before returning any shell, loading state or client providers. Pages
// and APIs retain their guards; this also protects unknown workspace routes.
export default async function WorkspaceLayout({children}: {children: React.ReactNode}) {
  const auth = await requireAdmin();
  if (auth.response?.status === 503) return <main className="login-wrap">
    <section className="login-card">
      <h1>Could not verify admin access.</h1>
      <p role="alert">The service is temporarily unavailable. Please try again.</p>
      <a className="button primary" href="/admin">Try again</a>
    </section>
  </main>;
  if (auth.response)
    redirect(auth.response.status === 401 ? "/admin/login" : "/admin/login?error=access");
  return <AdminWorkspace>{children}</AdminWorkspace>;
}
