/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() { return [{source:'/confirm',headers:[{key:'Cache-Control',value:'no-store, private'},{key:'Referrer-Policy',value:'no-referrer'},{key:'X-Frame-Options',value:'DENY'},{key:'Content-Security-Policy',value:"frame-ancestors 'none'"}]}]; },
  distDir: ".next",
  experimental: {
    serverComponentsExternalPackages: ["postgres", "drizzle-orm", "stripe"],
  },
};

module.exports = nextConfig;

