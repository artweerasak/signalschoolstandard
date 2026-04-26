/**
 * app/my/layout.tsx
 * Layout สำหรับกำลังพลทั่วไป — Sidebar สีม่วง เหมือนกัน แต่เมนูต่างออกไป
 */
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { api, CurrentUser } from "@/lib/api"

const navItems = [
  { href: "/my",              label: "หน้าหลัก",      icon: "🏠" },
  { href: "/my/courses",      label: "หลักสูตรทั้งหมด", icon: "📚" },
  { href: "/my/certificates", label: "ใบประกาศของฉัน", icon: "📜" },
  { href: "/my/profile",      label: "ข้อมูลส่วนตัว",  icon: "👤" },
]

function StudentSidebar({ user }: { user: CurrentUser | null }) {
  const pathname = usePathname()
  return (
    <aside className="w-60 min-h-screen bg-[#2D0F42] flex flex-col">
      <div className="flex flex-col items-center gap-3 px-6 py-8 border-b border-[#4A1A6B]">
        <Image src="/signal_logo.png" alt="กรมการทหารสื่อสาร" width={60} height={60}
          className="rounded-full border-2 border-[#C9A84C] bg-white p-0.5" />
        <div className="text-center">
          <p className="text-white text-sm font-bold">กรมการทหารสื่อสาร</p>
          <p className="text-[#C9A84C] text-xs mt-0.5">ระบบการเรียนออนไลน์</p>
        </div>
      </div>
      <nav className="flex-1 px-3 py-6 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors
                ${isActive ? "bg-[#4A1A6B] text-white font-semibold" : "text-purple-200 hover:bg-[#4A1A6B] hover:text-white"}`}>
              <span>{item.icon}</span>{item.label}
            </Link>
          )
        })}
      </nav>
      {user && (
        <div className="px-4 py-4 border-t border-[#4A1A6B]">
          <p className="text-[#C9A84C] text-xs font-semibold uppercase tracking-wide mb-1">ผู้ใช้งาน</p>
          <p className="text-white text-sm font-medium truncate">{user.full_name}</p>
          {user.rank && <p className="text-purple-300 text-xs">{user.rank}</p>}
          {user.unit && <p className="text-purple-400 text-xs truncate">{user.unit}</p>}
          <Link href="/login" className="mt-3 block text-xs text-purple-400 hover:text-white transition-colors">
            ออกจากระบบ →
          </Link>
        </div>
      )}
    </aside>
  )
}

export default function MyLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.me()
      .then((u) => {
        // Admin และ instructor เป็นกำลังพลที่ต้องถูกตรวจสอบใบประกาศเช่นเดียวกับ student
        // จึงอนุญาตให้เข้าถึง /my/certificates และ /my/profile ได้ แต่ redirect จากหน้าอื่นๆ ใน /my/
        const personalPages = ["/my/certificates", "/my/profile"]
        const isPersonalPage = personalPages.some((p) => pathname.startsWith(p))

        if ((u.is_staff || u.role === "admin") && !isPersonalPage) {
          router.replace("/dashboard")
          return
        }
        if (u.role === "instructor" && !isPersonalPage) {
          router.replace("/instructor")
          return
        }
        setUser(u)
      })
      .catch((err) => {
        if (err.message === "UNAUTHORIZED") router.replace("/login")
      })
      .finally(() => setLoading(false))
  }, [router, pathname])

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
      <StudentSidebar user={user} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h1 className="text-[#4A1A6B] font-bold text-base">
            ระบบการเรียนการสอนออนไลน์ · กรมการทหารสื่อสาร
          </h1>
          {user && (
            <span className="text-sm text-gray-500">
              {user.rank ? `${user.rank} ` : ""}{user.full_name}
            </span>
          )}
        </header>
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
