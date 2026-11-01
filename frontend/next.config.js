/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next-local",
  experimental: {
    serverComponentsExternalPackages: ["postgres", "drizzle-orm", "stripe"],
  },
};

module.exports = nextConfig;
