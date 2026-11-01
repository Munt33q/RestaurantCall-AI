/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: ".next",
  experimental: {
    serverComponentsExternalPackages: ["postgres", "drizzle-orm", "stripe"],
  },
};

module.exports = nextConfig;

