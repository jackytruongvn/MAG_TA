/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ['node-cron', '@prisma/client'],
  },
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
