import type { NextConfig } from 'next';

const pageRoutes = ['/', '/qr', '/qr-test', '/upload', '/gallery', '/device', '/display', '/debug-sync'];

const config: NextConfig = {
  distDir: process.env.EXHIBITION_BUILD_DIR || '.next',
  devIndicators: false,
  async headers() {
    return [
      ...pageRoutes.map(source => ({
        source,
        headers: [
          { key: 'Content-Disposition', value: 'inline' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      })),
      {
        source: '/upload',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },
};
export default config;
