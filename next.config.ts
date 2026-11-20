import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the dev badge sits over the footer hint; errors still surface without it
  devIndicators: false,
  turbopack: {
    // A stray lockfile higher up the drive confuses root inference.
    root: path.join(__dirname),
  },
};

export default nextConfig;
