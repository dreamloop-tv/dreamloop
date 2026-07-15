import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Evita que o Next infira a raiz errada por lockfiles fora do projeto
  // (crítico para o file tracing do OpenNext).
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;

initOpenNextCloudflareForDev();
