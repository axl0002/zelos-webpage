"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/client";

const accessMessage = "This account does not have admin access. Use your assigned admin account.";
const networkMessage = "Could not connect. Please try again.";
type AuthFailure = {status?: number; code?: string};
const rateLimited = (error: AuthFailure) => error.status === 429 || ["over_email_send_rate_limit", "over_request_rate_limit"].includes(error.code ?? "");
const connectionFailure = (error: AuthFailure) => error.status === 0 || (error.status ?? 0) >= 500;
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

export default function Login() {
  const router = useRouter();
  // Enable only after SMTP and a template containing {{ .Token }} are verified.
  // Supabase's default mail provider currently cannot send our code template.
  const emailCodesEnabled = process.env.NEXT_PUBLIC_ADMIN_EMAIL_CODE_ENABLED === "true";
  const [mode, setMode] = useState<"code" | "password">(emailCodesEnabled ? "code" : "password");
  const [email, setEmail] = useState(""), [sentTo, setSentTo] = useState("");
  const [password, setPassword] = useState(""), [code, setCode] = useState("");
  const [action, setAction] = useState<"send" | "verify" | "password" | null>(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const pending = useRef(false), retryAt = useRef(0), mounted = useRef(true);
  const busy = action !== null;
  useEffect(() => {
    mounted.current = true;
    const reason = new URLSearchParams(window.location.search).get("error");
    if (reason) setError(reason === "expired" ? emailCodesEnabled
      ? "This sign-in link has expired. Request a new code below."
      : "This sign-in link has expired. Sign in with your email and password." : accessMessage);
    return () => {mounted.current = false;};
  }, [emailCodesEnabled]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown(Math.max(0, Math.ceil((retryAt.current - Date.now()) / 1000))), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);
  function waitToResend() {retryAt.current = Date.now() + 60_000; setCooldown(60);}
  async function checkAccess(client: ReturnType<typeof browserClient>) {
    try {
      const {error: accessError} = await client.rpc("admin_rank_review_context");
      if (accessError) {
        try {await client.auth.signOut({scope: "local"});} catch { /* Access remains denied even when logout cannot reach Auth. */ }
        if (mounted.current) setError(accessError.code === "42501" ? accessMessage : "The review service is unavailable. Please try again.");
        return;
      }
      if (!mounted.current) return;
      setPassword(""); setCode(""); router.replace("/admin"); router.refresh();
    } catch {
      try {await client.auth.signOut({scope: "local"});} catch { /* Never navigate without verified admin access. */ }
      if (mounted.current) setError(networkMessage);
    }
  }
  async function sendCode() {
    if (!emailCodesEnabled || pending.current || Date.now() < retryAt.current || !validEmail(sentTo || email)) return;
    pending.current = true; setAction("send"); setError(""); setNotice("");
    const destination = sentTo || email.trim();
    try {
      const {error: authError} = await browserClient().auth.signInWithOtp({email: destination, options: {shouldCreateUser: false}});
      if (!mounted.current) return;
      if (authError) {
        if (rateLimited(authError)) waitToResend();
        setError(rateLimited(authError) ? "Too many code requests. Please wait before trying again." : connectionFailure(authError) ? networkMessage : "Could not send a code. Check your email and use an existing Zelos account.");
        return;
      }
      setSentTo(destination); setEmail(destination); setCode(""); waitToResend();
      setNotice("Check your inbox for a sign-in code. Use the latest code received.");
    } catch {if (mounted.current) setError(networkMessage);}
    finally {pending.current = false; if (mounted.current) setAction(null);}
  }
  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    if (mode === "code" && !sentTo) {await sendCode(); return;}
    if (pending.current || (mode === "code" ? !/^\d{6,10}$/.test(code) : !validEmail(email) || !password)) return;
    pending.current = true; setAction(mode === "code" ? "verify" : "password"); setError(""); setNotice("");
    try {
      const client = browserClient();
      const {error: authError} = mode === "code"
        ? await client.auth.verifyOtp({email: sentTo, token: code, type: "email"})
        : await client.auth.signInWithPassword({email: email.trim(), password});
      if (authError) {
        if (mounted.current) setError(rateLimited(authError) ? "Too many attempts. Please wait before trying again." : connectionFailure(authError) ? networkMessage
          : mode === "code" ? "This code is invalid or has expired. Try the latest code or request a new one." : "Could not sign in. Check your email and password.");
        return;
      }
      if (mounted.current) setCode("");
      await checkAccess(client);
    } catch {if (mounted.current) setError(networkMessage);}
    finally {pending.current = false; if (mounted.current) setAction(null);}
  }
  function switchMode() {
    if (!emailCodesEnabled || pending.current) return;
    setMode(mode === "code" ? "password" : "code"); setSentTo(""); setPassword(""); setCode(""); setError(""); setNotice("");
  }
  return <main className="login-wrap"><section className="login-card">
    <a href="/" className="brand">zelos<span> / admin</span></a>
    <p className="eyebrow">REVIEW WORKSPACE</p><h1>Welcome back.</h1>
    <p className="muted">Sign in with your Zelos admin account.</p>
    <form onSubmit={signIn}>
      <label htmlFor="email">Email address</label>
      <input id="email" type="email" autoComplete="username" maxLength={254} value={email} disabled={busy} readOnly={mode === "code" && !!sentTo}
        onChange={event => setEmail(event.target.value)} required placeholder="you@example.com" />
      {mode === "password" ? <>
        <label htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete="current-password" value={password} disabled={busy} onChange={event => setPassword(event.target.value)} required />
      </> : sentTo ? <>
        <label htmlFor="code">Sign-in code</label>
        <input id="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" maxLength={10} value={code} disabled={busy}
          onChange={event => setCode(event.target.value.replace(/\s/g, ""))} required />
      </> : null}
      <button className="button primary full" disabled={busy || (mode === "password" ? !validEmail(email) || !password : sentTo ? !/^\d{6,10}$/.test(code) : !validEmail(email) || cooldown > 0)}>
        {action === "send" ? "Sending code…" : busy ? "Signing in…" : mode === "password" ? "Sign in" : sentTo ? "Verify code and sign in" : cooldown > 0 ? `Send code in ${cooldown}s` : "Send sign-in code"}
      </button>
    </form>
    {mode === "code" && sentTo && <div className="decision-actions">
      <button type="button" className="button text" disabled={busy || cooldown > 0} onClick={() => void sendCode()}>{cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}</button>
      <button type="button" className="button text" disabled={busy} onClick={() => {setSentTo(""); setCode(""); setNotice(""); setError("");}}>Change email</button>
    </div>}
    {emailCodesEnabled && <button type="button" className="button text" disabled={busy} onClick={switchMode}>{mode === "code" ? "Sign in with password" : "Sign in with an email code"}</button>}
    {notice && <p role="status" className="muted">{notice}</p>}
    {error && <p role="alert" className="error">{error}</p>}
    <p className="muted small">Access is limited to assigned admins.</p>
  </section></main>;
}
