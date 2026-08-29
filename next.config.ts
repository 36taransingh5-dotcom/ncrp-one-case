import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // "standalone" packages a self-contained server.js for the Dockerfile-based
  // hosts this app targets. Vercel's own build expects the default output
  // instead, so skip it there.
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  turbopack: { root: process.cwd() },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};
export default nextConfig;
