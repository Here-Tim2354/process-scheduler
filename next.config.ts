import type { NextConfig } from "next";

const isElectronBuild = process.env.BUILD_TARGET === "electron";

const nextConfig: NextConfig = isElectronBuild
  ? {
      output: "export",
      assetPrefix: "./",
      images: {
        unoptimized: true,
      },
    }
  : {};

export default nextConfig;
