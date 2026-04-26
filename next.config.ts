import type { NextConfig } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://signalstandard.rta.mi.th"

const securityHeaders = [
  // ป้องกัน clickjacking
  { key: "X-Frame-Options", value: "DENY" },
  // ป้องกัน MIME sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // บังคับ HTTPS (HSTS)
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // ควบคุม referrer
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // ป้องกัน XSS
  { key: "X-XSS-Protection", value: "1; mode=block" },
  // ป้องกันไม่ให้ browser ส่ง sensitive features ออกนอก origin
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Content Security Policy — อนุญาตเฉพาะ self + CDN ที่ใช้จริง
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js ต้องการ unsafe-inline
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://signalstandard.rta.mi.th",
      "font-src 'self'",
      "frame-src 'none'",
      "connect-src 'self' https://signalstandard.rta.mi.th",
    ].join("; "),
  },
]

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

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ]
  },

  images: {
    remotePatterns: [
      {
        // HTTPS เท่านั้น — ไม่อนุญาต HTTP ใน production
        protocol: "https",
        hostname: "signalstandard.rta.mi.th",
      },
    ],
  },
}

export default nextConfig;
