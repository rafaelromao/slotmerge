import type { NextConfig } from "next";

type WatchOptions = {
  ignored?: Array<string | RegExp>;
};

type WebpackConfig = {
  watchOptions?: WatchOptions;
};

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {},
  webpack: (config: WebpackConfig, { dev }: { dev: boolean }) => {
    if (dev) {
      const watchOptions = config.watchOptions ?? {};
      config.watchOptions = {
        ...watchOptions,
        ignored: [
          ...(watchOptions.ignored ?? []),
          "**/tests/e2e-browser/screenshots/**",
          "**/playwright/.artifacts/**",
        ],
      };
    }
    return config;
  },
};

export default nextConfig;
