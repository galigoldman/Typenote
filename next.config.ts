import type { NextConfig } from 'next';
import withPWAInit from '@ducanh2912/next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
});

const nextConfig: NextConfig = {
  /* config options here */
  // Required: next-pwa uses webpack, so turbopack must be explicitly configured
  // to avoid a conflict error in Next.js 16
  turbopack: {},
};

export default withPWA(nextConfig);
