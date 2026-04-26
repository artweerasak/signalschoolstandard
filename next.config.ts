import type { NextConfig } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://signalstandard.rta.mi.th"

const nextConfig: NextConfig = {
  // Proxy /edx/* → Open edX LMS เพื่อแก้ปัญหา CORS และ Secure cookie
  async rewrites() {
    return [
      {
        source: "/edx/:path*",
        destination: `${API_URL}/:path*`,
      },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "signalstandard.rta.mi.th",
      },
      {
        protocol: "http",
        hostname: "signalstandard.rta.mi.th",
      },
    ],
  },
}

export default nextConfig;
