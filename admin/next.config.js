const { PHASE_DEVELOPMENT_SERVER } = require("next/constants");
const { validatePublicEnvironment } = require("./public-env.cjs");

/** @param {string} phase @returns {import("next").NextConfig} */
module.exports = (phase) => {
  validatePublicEnvironment(process.env);
  return {
    // Keep validation builds from replacing the running dev server’s CSS/chunks.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    basePath: "/admin",
    output: "standalone",
    poweredByHeader: false,
    async headers() {
      return [
        {
          source: "/:path*",
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
