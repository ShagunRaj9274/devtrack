import type { NextConfig } from 'next';

// When set (at build time), the web app forwards /api/* to the NestJS API, so the browser
// talks to a single origin and the refresh cookie stays first-party. Needed when the web app
// and API live on different sites (e.g. *.vercel.app and *.onrender.com).
const apiProxyTarget = process.env.API_PROXY_TARGET?.replace(/\/$/, '');

const nextConfig: NextConfig = {
  // Produces a minimal self-contained server for the Docker image.
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // Inlined into the browser bundle so the client knows which mode it was built for.
  env: {
    DEVTRACK_API_PROXY: apiProxyTarget ? '1' : '',
    DEVTRACK_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL || apiProxyTarget || '',
  },
  async rewrites() {
    return apiProxyTarget ? [{ source: '/api/:path*', destination: `${apiProxyTarget}/api/:path*` }] : [];
  },
};

export default nextConfig;
