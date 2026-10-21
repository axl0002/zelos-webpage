import AdminWorkspace from "@/components/admin-workspace";

// Each page and API retains its server-side admin check. This shared layout
// deliberately has no second authorization request or redirect of its own.
export default function WorkspaceLayout({children}: {children: React.ReactNode}) {
  return <AdminWorkspace>{children}</AdminWorkspace>;
}
