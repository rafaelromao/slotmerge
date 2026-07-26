import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...(config.watchOptions ?? {}),
        ignored: [
          "**/tests/e2e-browser/screenshots/**",
          "**/playwright/.artifacts/**",
        ],
      };
    }
    return config;
  },
};

export default nextConfig;
