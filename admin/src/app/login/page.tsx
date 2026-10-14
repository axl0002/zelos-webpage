"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/client";
export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error"))
      setError(
        "This account does not have admin access. Use your assigned admin account.",
      );
  }, []);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const client = browserClient();
    try {
      const { error: authError } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) {
        setError(
          authError.status === 429
            ? "Too many attempts. Please wait before trying again."
            : "Could not sign in. Check your email and password.",
        );
        return;
      }
      const { error: accessError } = await client.rpc(
        "admin_rank_review_context",
      );
      if (accessError) {
        await client.auth.signOut({ scope: "local" });
        setError(
          accessError.code === "42501"
            ? "This account does not have admin access. Use your assigned admin account."
            : "The review service is unavailable. Please try again.",
        );
        return;
      }
      setPassword("");
      router.replace("/");
      router.refresh();
    } catch {
      setError("Could not connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-wrap">
      <section className="login-card">
        <a href="/" className="brand">
          zelos<span> / admin</span>
        </a>
        <p className="eyebrow">REVIEW WORKSPACE</p>
        <h1>Welcome back.</h1>
        <p className="muted">Sign in with your Zelos admin account.</p>
        <form onSubmit={login}>
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            className="button primary full"
            disabled={busy || !email.trim() || !password}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <p className="muted small">Access is limited to assigned admins.</p>
      </section>
    </main>
  );
}
