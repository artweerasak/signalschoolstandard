/**
 * components/Sidebar.tsx
 * Navigation sidebar — สีม่วงเม็ดมะปราง
 */
"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"

const adminNavItems = [
  { href: "/dashboard", label: "ภาพรวม", icon: "📊" },
  { href: "/dashboard/users", label: "จัดการผู้ใช้", icon: "👥" },
  { href: "/dashboard/registrations", label: "อนุมัติสมัครสมาชิก", icon: "📋", badge: true },
  { href: "/dashboard/reports", label: "รายงานมาตรฐาน", icon: "📈" },
  { href: "/dashboard/certificates", label: "แจ้งเตือนใบประกาศ", icon: "🔔" },
  { href: "/dashboard/course-requirements", label: "กำหนดหลักสูตร", icon: "⚙️" },
  { href: "/dashboard/courses", label: "จัดการหลักสูตร", icon: "📚" },
  { href: "/dashboard/import-questions", label: "นำเข้าข้อสอบ", icon: "📥" },
]

// เมนูใบประกาศ/โปรไฟล์ส่วนตัวสำหรับ admin และ instructor (กำลังพลที่ต้องถูกตรวจสอบด้วย)
const adminPersonalItems = [
  { href: "/my/courses", label: "สมัครเรียนหลักสูตร", icon: "📚" },
  { href: "/my/certificates", label: "ใบประกาศของฉัน", icon: "📜" },
  { href: "/my/profile", label: "ข้อมูลส่วนตัว", icon: "👤" },
]

const instructorNavItems = [
  { href: "/instructor", label: "หลักสูตรของฉัน", icon: "📚" },
]

const instructorPersonalItems = [
  { href: "/my/courses", label: "สมัครเรียนหลักสูตร", icon: "📚" },
  { href: "/my/certificates", label: "ใบประกาศของฉัน", icon: "📜" },
  { href: "/my/profile", label: "ข้อมูลส่วนตัว", icon: "👤" },
]

const studentNavItems = [
  { href: "/my", label: "หน้าหลัก", icon: "🏠" },
  { href: "/my/courses", label: "หลักสูตร", icon: "📚" },
  { href: "/my/certificates", label: "ใบประกาศของฉัน", icon: "📜" },
  { href: "/my/profile", label: "ข้อมูลส่วนตัว", icon: "👤" },
]

interface SidebarProps {
  userName?: string
  userRank?: string | null
  userUnit?: string | null
  variant?: "admin" | "instructor" | "student"
  pendingCount?: number
}

export default function Sidebar({ userName, userRank, userUnit, variant = "admin", pendingCount }: SidebarProps) {
  const pathname = usePathname()

  const navItems = variant === "instructor"
    ? instructorNavItems
    : variant === "student"
    ? studentNavItems
    : adminNavItems

  const personalItems = variant === "admin"
    ? adminPersonalItems
    : variant === "instructor"
    ? instructorPersonalItems
    : null

  return (
    <aside className="w-64 min-h-screen bg-[#2D0F42] flex flex-col">
      {/* Logo + org name */}
      <div className="flex flex-col items-center gap-3 px-6 py-8 border-b border-[#4A1A6B]">
        <Image
          src="/signal_logo.png"
          alt="กรมการทหารสื่อสาร"
          width={64}
          height={64}
          className="rounded-full border-2 border-[#C9A84C] bg-white p-0.5"
        />
        <div className="text-center">
          <p className="text-white text-sm font-bold leading-tight">กรมการทหารสื่อสาร</p>
          <p className="text-[#C9A84C] text-xs mt-0.5">
            {variant === "admin" ? "ผู้ดูแลระบบ" : variant === "instructor" ? "ครูอาจารย์" : "กรมทหารสื่อสาร"}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-6 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/dashboard" && item.href !== "/my" && item.href !== "/instructor" && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors
                ${isActive
                  ? "bg-[#4A1A6B] text-white font-semibold"
                  : "text-purple-200 hover:bg-[#4A1A6B] hover:text-white"
                }`}
            >
              <span>{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {"badge" in item && item.badge && pendingCount && pendingCount > 0 ? (
                <span className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {pendingCount > 9 ? "9+" : pendingCount}
                </span>
              ) : null}
            </Link>
          )
        })}

        {/* เมนูส่วนตัวสำหรับ admin/instructor — กำลังพลที่ต้องถูกตรวจสอบใบประกาศด้วย */}
        {personalItems && (
          <>
            <div className="pt-4 pb-1 px-4">
              <p className="text-purple-400 text-xs uppercase tracking-wider">ส่วนตัว</p>
            </div>
            {personalItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors
                    ${isActive
                      ? "bg-[#4A1A6B] text-white font-semibold"
                      : "text-purple-200 hover:bg-[#4A1A6B] hover:text-white"
                    }`}
                >
                  <span>{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                </Link>
              )
            })}
          </>
        )}
      </nav>

      {/* User info */}
      {userName && (
        <div className="px-4 py-4 border-t border-[#4A1A6B]">
          <p className="text-white text-sm font-medium truncate">{userName}</p>
          {userRank && <p className="text-purple-300 text-xs">{userRank}</p>}
          {userUnit && <p className="text-purple-400 text-xs truncate">{userUnit}</p>}
          <Link href="/login" className="block mt-2 text-purple-400 hover:text-white text-xs transition-colors">
            ออกจากระบบ →
          </Link>
        </div>
      )}
    </aside>
  )
}
