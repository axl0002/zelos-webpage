const { PHASE_DEVELOPMENT_SERVER } = require("next/constants");
const { validatePublicEnvironment } = require("./public-env.cjs");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const {createHash} = require("node:crypto");
const {baselineHeaders, staticContentSecurityPolicy} = require("./security-policy.cjs");

/** @param {string} phase @returns {import("next").NextConfig} */
module.exports = (phase) => {
  validatePublicEnvironment(process.env);
  return {
    // Keep validation builds from replacing the running dev server’s CSS/chunks.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    output: "standalone",
    poweredByHeader: false,
    async redirects() {
      return [
        {
          source: "/:path*",
          has: [{ type: "host", value: "support.zelos.club" }],
          destination: "https://zelos.club/support",
          permanent: true,
        },
        {
          source: "/scores",
          destination: "/scoring",
          permanent: true,
        },
        {
          source: "/scores/:path*",
          destination: "/scoring/:path*",
          permanent: true,
        },
      ];
    },
    async rewrites() {
      return [
        { source: "/", destination: "/index.html" },
        ...["about", "support", "stats", "equipment"].map((page) => ({
          source: `/${page}`,
          destination: `/${page}.html`,
        })),
        ...["privacy", "terms"].flatMap((page) => [
          { source: `/${page}`, destination: `/legal/${page}.html` },
          { source: `/legal/${page}`, destination: `/legal/${page}.html` },
        ]),
      ];
    },
    async headers() {
      const pages = ["index", "about", "support", "stats", "equipment", "legal/privacy", "legal/terms"];
      const hashes = [...new Set(pages.flatMap(page => [...readFileSync(join(__dirname, "public", page + ".html"), "utf8")
        .matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
        .filter(match => match[1].trim())
        .map(match => `'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`)))];
      return [
        {source: "/:path*", headers: baselineHeaders},
        ...["/", "/index.html", "/about", "/about.html", "/support", "/support.html", "/stats", "/stats.html", "/equipment", "/equipment.html", "/privacy", "/terms", "/legal/privacy", "/legal/privacy.html", "/legal/terms", "/legal/terms.html"]
          .map(source => ({source, headers: [{key: "Content-Security-Policy", value: staticContentSecurityPolicy(hashes)}]})),
        {
          source: "/.well-known/:path*",
          headers: [
            { key: "Content-Type", value: "application/json" },
            { key: "Cache-Control", value: "public, max-age=3600" },
            { key: "X-Content-Type-Options", value: "nosniff" },
          ],
        },
        {
          source: "/admin/:path*",
          headers: [
            { key: "X-Frame-Options", value: "DENY" },
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "Referrer-Policy", value: "no-referrer" },
            { key: "Cache-Control", value: "private, no-store" },
          ],
        },
      ];
    },
  };
};
