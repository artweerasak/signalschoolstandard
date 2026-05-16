/**
 * app/dashboard/layout.tsx
 * Layout หน้า dashboard — มี Sidebar + top header
 */
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Sidebar from "@/components/Sidebar"
import { api, CurrentUser } from "@/lib/api"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    api.me()
      .then((u) => {
        setUser(u)
        if (!u.is_staff && u.role !== "admin") router.replace("/my")
      })
      .catch((err) => {
        if (err.message === "UNAUTHORIZED") router.replace("/login")
      })
      .finally(() => setLoading(false))
  }, [router])

  // โหลดจำนวน pending registrations สำหรับ badge
  useEffect(() => {
    if (!user) return
    api.adminRegistrations("pending")
      .then((r) => setPendingCount(r.count))
      .catch(() => {})
  }, [user])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f3f7]">
        <div className="flex flex-col items-center gap-3 text-[#4A1A6B]">
          <svg className="animate-spin h-10 w-10" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <p className="text-sm">กำลังโหลด...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-[#f5f3f7]">
      <Sidebar
        variant="admin"
        userName={user?.full_name}
        userRank={user?.rank}
        userUnit={user?.unit}
        pendingCount={pendingCount}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h1 className="text-[#4A1A6B] font-bold text-lg">
            ระบบการเรียนการสอนออนไลน์ · กรมการทหารสื่อสาร
          </h1>
          {user && (
            <div className="flex items-center gap-3">
              <a
                href={process.env.NEXT_PUBLIC_STUDIO_URL ?? "https://studio-signalstandard.rta.mi.th"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-[#4A1A6B] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#7B3FA0] transition-colors"
              >
                <span>🏫</span> Open edX Studio
              </a>
              <span className="text-sm text-gray-500">
                {user.rank ? `${user.rank} ` : ""}{user.full_name}
              </span>
            </div>
          )}
        </header>
        {/* Main content */}
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

