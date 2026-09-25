/**
 * app/my/layout.tsx
 * Layout สำหรับหน้าเรียน/ใบประกาศ — ทุก role เข้าได้ (student, admin, instructor)
 * admin/instructor มีปุ่มกลับ dashboard/instructor portal ด้วย
 */
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { api, CurrentUser, PROFILE_UPDATED_EVENT } from "@/lib/api"
import NotificationBell from "@/components/NotificationBell"
import Crest from "@/components/Crest"

const studentNavItems = [
  { href: "/my",              label: "หน้าหลัก",         icon: "🏠" },
  { href: "/my/courses",      label: "หลักสูตรทั้งหมด",  icon: "📚" },
  { href: "/my/transcript",   label: "ระเบียนประวัติ",   icon: "🎓" },
  { href: "/my/evaluations",  label: "แบบประเมิน",       icon: "📝" },
  { href: "/my/certificates", label: "ใบประกาศของฉัน",  icon: "📜" },
  { href: "/my/profile",      label: "ข้อมูลส่วนตัว",   icon: "👤" },
]

const adminNavItems = [
  { href: "/my/courses",      label: "สมัครเรียนหลักสูตร", icon: "📚" },
  { href: "/my/transcript",   label: "ระเบียนประวัติ",     icon: "🎓" },
  { href: "/my/evaluations",  label: "แบบประเมิน",         icon: "📝" },
  { href: "/my/certificates", label: "ใบประกาศของฉัน",    icon: "📜" },
  { href: "/my/profile",      label: "ข้อมูลส่วนตัว",     icon: "👤" },
]

const instructorNavItems = [
  { href: "/my/courses",      label: "สมัครเรียนหลักสูตร", icon: "📚" },
  { href: "/my/transcript",   label: "ระเบียนประวัติ",     icon: "🎓" },
  { href: "/my/evaluations",  label: "แบบประเมิน",         icon: "📝" },
  { href: "/my/certificates", label: "ใบประกาศของฉัน",    icon: "📜" },
  { href: "/my/profile",      label: "ข้อมูลส่วนตัว",     icon: "👤" },
]

function LearnerSidebar({ user }: { user: CurrentUser | null }) {
  const pathname = usePathname()

  const isAdmin = user?.is_staff || user?.role === "admin"
  const isInstructor = user?.role === "instructor"

  const navItems = isAdmin
    ? adminNavItems
    : isInstructor
    ? instructorNavItems
    : studentNavItems

  const backLink = isAdmin
    ? { href: "/dashboard", label: "← กลับหน้า Admin" }
    : isInstructor
    ? { href: "/instructor", label: "← กลับหน้าครูอาจารย์" }
    : null

  const roleLabel = isAdmin ? "ผู้ดูแลระบบ" : isInstructor ? "ครูอาจารย์" : "กรมทหารสื่อสาร"

  return (
    <aside className="w-60 min-h-screen bg-gradient-to-b from-[#2D0F42] to-[#230a35] flex flex-col">
      <div className="flex flex-col items-center gap-3 px-6 py-8 border-b border-white/10">
        <div className="relative">
          <span className="absolute inset-0 rounded-full blur-md bg-[#C9A84C]/30 -z-10 scale-125" aria-hidden="true" />
          <Crest size={60} className="border-2 border-[#C9A84C]" />
        </div>
        <div className="text-center">
          <p className="text-white text-sm font-bold">กรมการทหารสื่อสาร</p>
          <p className="text-[#E8C96A] text-xs mt-0.5 font-mono tracking-wide">{roleLabel}</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-6 space-y-1">
        {/* ปุ่มกลับ portal หลักสำหรับ admin/instructor */}
        {backLink && (
          <Link href={backLink.href}
            className="flex items-center gap-2 px-4 py-2 mb-3 rounded-xl text-xs text-purple-300 hover:text-white hover:bg-white/10 transition-colors border border-white/15">
            {backLink.label}
          </Link>
        )}
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/my" && pathname.startsWith(item.href))
          return (
            <Link key={item.href} href={item.href}
              className={`relative flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all duration-150
                ${isActive ? "bg-white/10 text-white font-semibold" : "text-purple-200/80 hover:bg-white/5 hover:text-white"}`}>
              {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-[#E8C96A]" aria-hidden="true" />}
              <span>{item.icon}</span>{item.label}
            </Link>
          )
        })}
      </nav>

      {user && (
        <div className="px-5 py-4 border-t border-white/10">
          <p className="text-[#E8C96A] text-[11px] font-mono font-semibold uppercase tracking-widest mb-1">ผู้ใช้งาน</p>
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

function MissingDatesBanner({ user }: { user: CurrentUser }) {
  const [dismissed, setDismissed] = useState(false)
  const missingBirth = !user.birth_date
  const missingSSD   = !user.service_start_date
  if (dismissed || (!missingBirth && !missingSSD)) return null

  const missing = [
    missingBirth && "วันเกิด",
    missingSSD   && "วันบรรจุ",
  ].filter(Boolean).join(" และ ")

  return (
    <div className="bg-red-600 text-white px-4 py-3 flex items-center justify-between gap-4 shadow-md">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xl shrink-0">📢</span>
        <p className="text-sm font-medium leading-snug">
          <span className="font-bold">ประชาสัมพันธ์:</span>{" "}
          ท่านยังไม่ได้กรอก <span className="underline font-bold">{missing}</span>{" "}
          กรุณาไปที่{" "}
          <Link href="/my/profile" className="underline font-bold hover:text-red-200 transition-colors">
            ข้อมูลส่วนตัว
          </Link>{" "}
          เพื่อเพิ่มข้อมูล — ระบบต้องการข้อมูลนี้เพื่อคำนวณอายุและอายุราชการ
        </p>
      </div>
      <button onClick={() => setDismissed(true)}
        className="shrink-0 text-white/70 hover:text-white text-lg leading-none transition-colors"
        aria-label="ปิด">✕</button>
    </div>
  )
}

export default function MyLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    function loadUser() {
      api.me()
        .then((u) => {
          // admin และ instructor เป็นกำลังพลที่ต้องเรียนและมีใบประกาศเช่นเดียวกับ student
          // จึงอนุญาตให้เข้าถึงทุกหน้าใน /my/ ได้ครบเหมือน student
          setUser(u)
        })
        .catch((err) => {
          if (err.message === "UNAUTHORIZED") router.replace("/login")
        })
        .finally(() => setLoading(false))
    }
    loadUser()
    // รีเฟรช user ทันทีหลังบันทึกวันเกิด/วันบรรจุใน /my/profile — ไม่งั้น banner แจ้งเตือนจะค้างแสดงข้อมูลเก่า
    window.addEventListener(PROFILE_UPDATED_EVENT, loadUser)
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, loadUser)
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
      <div className="hidden md:block"><LearnerSidebar user={user} /></div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-[#e6e1ee] px-4 md:px-6 py-4 flex items-center justify-between">
          <h1 className="text-[#2D0F42] font-bold text-sm md:text-base truncate">
            ระบบ eLearning · กรมการทหารสื่อสาร
          </h1>
          {user && (
            <div className="flex items-center gap-3">
              <NotificationBell />
              <span className="text-sm text-[#6b6478]">
                {user.rank ? `${user.rank} ` : ""}{user.full_name}
              </span>
            </div>
          )}
        </header>
        {user && <MissingDatesBanner user={user} />}
        <main className="flex-1 p-4 md:p-6 overflow-auto pb-20 md:pb-6">{children}</main>
        {/* Mobile bottom navigation */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#2D0F42] border-t border-white/10 flex z-40">
          {[
            { href: "/my", icon: "🏠", label: "หลัก" },
            { href: "/my/courses", icon: "📚", label: "หลักสูตร" },
            { href: "/my/certificates", icon: "📜", label: "ใบประกาศ" },
            { href: "/my/profile", icon: "👤", label: "โปรไฟล์" },
          ].map(item => (
            <Link key={item.href} href={item.href}
              className="flex-1 flex flex-col items-center py-2 text-purple-300 hover:text-white transition-colors">
              <span className="text-lg">{item.icon}</span>
              <span className="text-xs mt-0.5">{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}
