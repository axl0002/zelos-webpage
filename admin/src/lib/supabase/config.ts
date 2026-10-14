export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url !== "https://obnirsfjxcvyyiocwaii.supabase.co" || !key) {
    throw new Error("Configure the Zelos Supabase public client credentials.");
  }
  return { url, key };
}
export const cookieOptions = {
  path: "/admin",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};
