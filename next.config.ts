import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  serverExternalPackages: [
    '@napi-rs/canvas',
    'canvas',
    'tesseract.js',
    'unpdf',
  ],
};

export default nextConfig;
