import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hay un package-lock.json suelto en la carpeta personal: fija la raíz del proyecto.
  turbopack: { root: path.resolve(".") },
  // La guía anti-IA se lee en tiempo de ejecución: inclúyela en las funciones.
  outputFileTracingIncludes: {
    "/**": ["./src/lib/motor-creativo/guias/**/*"],
  },
  serverExternalPackages: ["sharp"],
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
