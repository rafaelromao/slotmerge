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
      const watchOptions = config.watchOptions ?? {};
      const ignored = Array.isArray(watchOptions.ignored)
        ? watchOptions.ignored
        : watchOptions.ignored
          ? [watchOptions.ignored]
          : [];
      config.watchOptions = {
        ...watchOptions,
        ignored: [
          ...ignored,
          "**/tests/e2e-browser/screenshots/**",
          "**/playwright/.artifacts/**",
        ],
      };
    }
    return config;
  },
};

export default nextConfig;
