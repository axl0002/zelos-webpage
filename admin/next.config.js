const { PHASE_DEVELOPMENT_SERVER } = require("next/constants");
const { validatePublicEnvironment } = require("./public-env.cjs");

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
      return [
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
