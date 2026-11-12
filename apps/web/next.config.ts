import type { NextConfig } from "next";
import { resolveApiUrl } from "./lib/config/api-url";

// Resuelve la dirección URL del backend usando las variables de entorno
const apiUrl = resolveApiUrl(process.env);

const nextConfig: NextConfig = {
  /* Opciones de configuración generales */
  cacheComponents: true, // Activa la caché de componentes para mayor velocidad

  experimental: {
    // IMPORTANTE: Next.js guarda temporalmente en memoria el cuerpo de las peticiones del proxy.
    // Como el backend acepta archivos de hasta 10 MB, aumentamos el límite a 11 MB
    // para evitar que un PDF grande falle con error 500 al ser reenviado.
    proxyClientMaxBodySize: "11mb",
  },

  // Configuración de reescrituras (Proxy inverso):
  // Redirige todas las peticiones de `/api/...` hacia el servidor backend real.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },

  partialPrefetching: true, // Precarga parcial de páginas para mejorar la navegación

  // Configuración del empaquetador ultrarrápido Turbopack para manejar Tailwind CSS
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
