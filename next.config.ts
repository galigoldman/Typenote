import type { NextConfig } from 'next';
import withPWAInit from '@ducanh2912/next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
});

const nextConfig: NextConfig = {
  // Required: next-pwa uses webpack, so turbopack must be explicitly configured
  // to avoid a conflict error in Next.js 16
  turbopack: {},
  // Large canvas documents (many pages with math/strokes) can exceed the
  // default 1 MB Server Action body limit, causing silent save failures.
  experimental: {
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
  // Allow iPad/mobile devices on the local network to access dev server
  allowedDevOrigins: [
    '172.20.10.2',
    '192.168.*.*',
    '10.*.*.*',
    '172.16-31.*.*',
  ],
  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://us.i.posthog.com/:path*',
      },
    ];
  },
  // Prevent ad-blockers from blocking the proxy via header sniffing
  skipTrailingSlashRedirect: true,
};

export default withPWA(nextConfig);
