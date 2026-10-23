import type { NextConfig } from "next";
import { resolveApiUrl } from "./lib/config/api-url";

// La API no habilita CORS: el navegador la llama en el mismo origen y Next reenvía /api al backend.
const apiUrl = resolveApiUrl(process.env);

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
