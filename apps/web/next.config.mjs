/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@biru/shared"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.supabase.co" }],
  },
};

export default nextConfig;
