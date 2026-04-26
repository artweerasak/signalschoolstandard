/**
 * app/instructor/layout.tsx
 * Layout สำหรับ Instructor (ครูอาจารย์)
 */
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Sidebar from "@/components/Sidebar"
import { api, CurrentUser } from "@/lib/api"

export default function InstructorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.me()
      .then((u) => {
        if (u.role !== "instructor" && !u.is_staff) {
          if (u.is_staff) router.replace("/dashboard")
          else router.replace("/my")
          return
        }
        setUser(u)
      })
      .catch((err) => {
        if (err.message === "UNAUTHORIZED") router.replace("/login")
      })
      .finally(() => setLoading(false))
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f3f7]">
        <svg className="animate-spin h-10 w-10 text-[#4A1A6B]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-[#f5f3f7]">
      <Sidebar
        variant="instructor"
        userName={user?.full_name}
        userRank={user?.rank}
        userUnit={user?.unit}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h1 className="text-[#4A1A6B] font-bold text-lg">
            ระบบการเรียนการสอนออนไลน์ · กรมการทหารสื่อสาร
          </h1>
          {user && (
            <span className="text-sm text-gray-500">
              {user.rank ? `${user.rank} ` : ""}{user.full_name}
              <span className="ml-2 bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">
                ครูอาจารย์
              </span>
            </span>
          )}
        </header>
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
