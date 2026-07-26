import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  webpack: (config, { dev }) => {
    if (dev) {
      const ignored = config.watchOptions?.ignored;
      const ignoredList = Array.isArray(ignored)
        ? ignored
        : ignored
          ? [ignored]
          : [];
      config.watchOptions = {
        ...(config.watchOptions ?? {}),
        ignored: [
          ...ignoredList,
          "**/tests/e2e-browser/screenshots/**",
          "**/playwright/.artifacts/**",
        ],
      };
    }
    return config;
  },
};

export default nextConfig;
