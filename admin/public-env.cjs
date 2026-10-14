// Runs before Next.js bundles NEXT_PUBLIC_* values into browser assets.
function validatePublicEnvironment(env) {
  let publicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  );
  if (!publicKey) {
    try {
      const parts = env.NEXT_PUBLIC_SUPABASE_ANON_KEY.split(".");
      const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      publicKey = parts.length === 3 && claims.role === "anon" &&
        claims.ref === "obnirsfjxcvyyiocwaii";
    } catch {
      publicKey = false;
    }
  }
  if (!publicKey || env.NEXT_PUBLIC_SUPABASE_URL !== "https://obnirsfjxcvyyiocwaii.supabase.co") {
    throw new Error(
      "Configure the Zelos Supabase URL and a public anon/publishable key. Secret, service-role, management and user tokens must never be used in NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
}

module.exports = { validatePublicEnvironment };
