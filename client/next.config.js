/** @type {import('next').NextConfig} */
const isExport = process.env.NEXT_EXPORT === 'true';

const nextConfig = {
  output: isExport ? 'export' : 'standalone',
  images: {
    unoptimized: true,
  },
  reactStrictMode: false,
  experimental: {
    cpus: 1,
  },
  ...(isExport
    ? {}
    : {
        async headers() {
          return [
            {
              source: '/:path*',
              headers: [
                {
                  key: 'X-Robots-Tag',
                  value: 'noindex, nofollow, nosnippet, noimageindex',
                },
              ],
            },
          ];
        },
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
