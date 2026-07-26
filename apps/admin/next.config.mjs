/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@dizkarte/config", "@dizkarte/domain"],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
