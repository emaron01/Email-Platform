import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep PDF extraction native deps out of the webpack bundle so pdfjs can load
  // with Node polyfills (DOMMatrix) on hosts without @napi-rs/canvas.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
};

export default nextConfig;
