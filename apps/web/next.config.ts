import type { NextConfig } from "next";
import { resolveApiUrl } from "./lib/config/api-url";

// La API no habilita CORS: el navegador la llama en el mismo origen y Next reenvía /api al backend.
const apiUrl = resolveApiUrl(process.env);

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  experimental: {
    // Next guarda en memoria el cuerpo de los pedidos que pasan por el rewrite y lo corta en 10 MB
    // (también sin proxy.ts). Un PDF de 10 MB más el resto del formulario lo supera: la API recibía
    // el cuerpo incompleto y la carga terminaba en 500 a los 30 s. 11 MB deja lugar al multipart (T26).
    proxyClientMaxBodySize: "11mb",
  },
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
