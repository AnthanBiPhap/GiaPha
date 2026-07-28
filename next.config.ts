import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  env: {
    NEXT_PUBLIC_TRACKASIA_API_KEY: process.env.NEXT_PUBLIC_TRACKASIA_API_KEY,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "uunxxqdkdmqrwjufkotz.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
