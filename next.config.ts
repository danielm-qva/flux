import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tauri embeds static files; it does not run a Next.js server in production.
  output: "export",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
