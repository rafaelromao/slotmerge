import type { NextConfig } from "next";

type WatchOptions = {
  ignored?: string | RegExp | Array<string | RegExp>;
};

type WebpackConfig = {
  watchOptions?: WatchOptions;
};

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {},
  webpack: (config: WebpackConfig, { dev }: { dev: boolean }) => {
    if (dev) {
      config.watchOptions = {
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
