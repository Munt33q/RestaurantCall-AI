/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next-local",
  typescript: {ignoreBuildErrors: true},
};

module.exports = nextConfig;
