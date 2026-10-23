const base = ["base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'", "form-action 'self'"];
const baselineHeaders = [
  {key: "X-Frame-Options", value: "DENY"},
  {key: "X-Content-Type-Options", value: "nosniff"},
  {key: "Referrer-Policy", value: "no-referrer"},
  {key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()"},
  {key: "Content-Security-Policy", value: base.join("; ")},
];

/** @param {string[]} hashes */
function staticContentSecurityPolicy(hashes) {
  return [
    "default-src 'self'", ...base,
    `script-src 'self' ${hashes.join(" ")} https://www.gstatic.com https://www.google.com https://www.recaptcha.net https://cdnjs.cloudflare.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https://www.gstatic.com https://www.google.com",
    "connect-src 'self' https://firestore.googleapis.com https://firebaseappcheck.googleapis.com https://content-firebaseappcheck.googleapis.com https://firebaseinstallations.googleapis.com https://www.google.com https://www.recaptcha.net https://www.gstatic.com",
    "frame-src https://www.google.com https://recaptcha.google.com https://www.recaptcha.net",
    "worker-src 'self' blob:",
  ].join("; ");
}

/** @param {string} nonce @param {boolean} admin @param {boolean} development */
function dynamicContentSecurityPolicy(nonce, admin, development = false) {
  if (!/^[A-Za-z0-9+/_-]{16,}={0,2}$/.test(nonce)) throw new Error("Invalid script nonce");
  return [
    "default-src 'self'", ...base,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https://media.zelos.club https://cdn.zelos.club https://firebasestorage.googleapis.com https://*.r2.cloudflarestorage.com",
    admin ? "connect-src 'self' https://obnirsfjxcvyyiocwaii.supabase.co wss://obnirsfjxcvyyiocwaii.supabase.co" : "connect-src 'self'",
    "media-src 'self' https://media.zelos.club https://*.r2.cloudflarestorage.com",
    "frame-src 'none'",
  ].join("; ");
}

module.exports = {baselineHeaders, staticContentSecurityPolicy, dynamicContentSecurityPolicy};
