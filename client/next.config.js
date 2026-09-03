/** @type {import('next').NextConfig} */
const isExport = process.env.NEXT_EXPORT === 'true';

const nextConfig = {
  output: isExport ? 'export' : 'standalone',
  images: {
    unoptimized: true,
  },
  reactStrictMode: false,
  ...(isExport
    ? {}
    : {
        async rewrites() {
          return [
            {
              source: '/api/:path*',
              destination: process.env.INTERNAL_API_URL || 'http://localhost:4000/:path*',
            },
          ];
        },
      }),
};

module.exports = nextConfig;
