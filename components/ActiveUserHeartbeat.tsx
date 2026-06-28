"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

const PING_INTERVAL_MS = 4 * 60 * 1000   // ทุก 4 นาที (ACTIVE_TTL = 5 นาที)
const PUBLIC_PATHS     = ["/login", "/register", "/privacy", "/reset-password"]

export default function ActiveUserHeartbeat() {
  const pathname = usePathname()
  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))

  useEffect(() => {
    if (isPublic) return

    async function ping() {
      try {
        await fetch("/military/api/v1/me/", {
          credentials: "include",
          headers: { "Accept": "application/json" },
        })
      } catch {
        // ไม่ต้องทำอะไร — heartbeat ล้มเหลวก็ไม่ block ผู้ใช้
      }
    }

    const id = setInterval(ping, PING_INTERVAL_MS)
    return () => clearInterval(id)
  }, [isPublic])

  return null
}
