/**
 * components/Sidebar.tsx
 * Navigation sidebar — จัดหมวดหมู่เมนู
 */
"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"

// ─── ประเภทเมนู ───────────────────────────────────────────
type NavItem = { href: string; label: string; icon: string; badge?: boolean }
type NavGroup = { groupLabel?: string; items: NavItem[] }

// ─── Admin ────────────────────────────────────────────────
const adminNavGroups: NavGroup[] = [
  {
    items: [
      { href: "/dashboard", label: "ภาพรวม", icon: "📊" },
    ],
  },
  {
    groupLabel: "จัดการผู้ใช้",
    items: [
      { href: "/dashboard/users", label: "รายชื่อผู้ใช้", icon: "👥" },
      { href: "/dashboard/registrations", label: "อนุมัติสมัครสมาชิก", icon: "📋", badge: true },
      { href: "/dashboard/whitelist", label: "รายชื่อผู้มีสิทธิ์สมัคร", icon: "🔐" },
      { href: "/dashboard/users/bulk-import", label: "นำเข้าผู้ใช้ (Excel)", icon: "📤" },
    ],
  },
  {
    groupLabel: "หลักสูตร",
    items: [
      { href: "/dashboard/courses", label: "จัดการหลักสูตร", icon: "🎓" },
      { href: "/dashboard/course-requirements", label: "กำหนดมาตรฐาน", icon: "⚙️" },
    ],
  },
  {
    groupLabel: "ใบประกาศ",
    items: [
      { href: "/dashboard/certificate-approval", label: "อนุมัติใบประกาศ", icon: "✅" },
      { href: "/dashboard/certificates", label: "แจ้งเตือนใบประกาศ", icon: "🔔" },
    ],
  },
  {
    groupLabel: "รายงาน",
    items: [
      { href: "/dashboard/reports/summary", label: "สรุปสถานะกำลังพล", icon: "📊" },
      { href: "/dashboard/reports", label: "รายงานมาตรฐาน", icon: "📈" },
    ],
  },
  {
    groupLabel: "หน่วยงาน",
    items: [
      { href: "/dashboard/organizations", label: "จัดการหน่วยงาน", icon: "🏢" },
    ],
  },
  {
    groupLabel: "ระบบ",
    items: [
      { href: "/dashboard/system-health", label: "สถานะระบบ", icon: "🖥️" },
      { href: "/dashboard/locked-accounts", label: "บัญชีที่ถูกล็อก", icon: "🔓" },
      { href: "/dashboard/audit-log", label: "Audit Log", icon: "📋" },
    ],
  },
]

const adminPersonalGroups: NavGroup[] = [
  {
    groupLabel: "ส่วนตัว",
    items: [
      { href: "/my/courses", label: "สมัครเรียนหลักสูตร", icon: "📚" },
      { href: "/my/certificates", label: "ใบประกาศของฉัน", icon: "📜" },
      { href: "/my/profile", label: "ข้อมูลส่วนตัว", icon: "👤" },
    ],
  },
]

// ─── Instructor ───────────────────────────────────────────
const instructorNavGroups: NavGroup[] = [
  {
    groupLabel: "หลักสูตร",
    items: [
      { href: "/instructor", label: "หลักสูตรของฉัน", icon: "🎓" },
      { href: "/instructor/my-courses", label: "คะแนน/วิชาในหลักสูตร", icon: "📝" },
      { href: "/instructor/videos", label: "วิดีโอการสอน", icon: "🎬" },
      { href: "/instructor/documents", label: "เอกสาร / ตำราเรียน", icon: "📄" },
    ],
  },
  {
    groupLabel: "ข้อสอบ",
    items: [
      { href: "/instructor/import-questions", label: "นำเข้าข้อสอบ", icon: "📥" },
      { href: "/instructor/library-manage", label: "จัดการคลังข้อสอบ", icon: "🗂️" },
    ],
  },
]

const instructorPersonalGroups: NavGroup[] = [
  {
    groupLabel: "ส่วนตัว",
    items: [
      { href: "/my/courses", label: "สมัครเรียนหลักสูตร", icon: "📚" },
      { href: "/my/certificates", label: "ใบประกาศของฉัน", icon: "📜" },
      { href: "/my/profile", label: "ข้อมูลส่วนตัว", icon: "👤" },
    ],
  },
]

// ─── Student ──────────────────────────────────────────────
const studentNavGroups: NavGroup[] = [
  {
    items: [
      { href: "/my", label: "หน้าหลัก", icon: "🏠" },
      { href: "/my/courses", label: "หลักสูตร", icon: "📚" },
      { href: "/my/certificates", label: "ใบประกาศของฉัน", icon: "📜" },
      { href: "/my/profile", label: "ข้อมูลส่วนตัว", icon: "👤" },
    ],
  },
]

// ─── Component ────────────────────────────────────────────
interface SidebarProps {
  userName?: string
  userRank?: string | null
  userUnit?: string | null
  variant?: "admin" | "instructor" | "student"
  pendingCount?: number
}

function NavGroupSection({
  group,
  pathname,
  pendingCount,
}: {
  group: NavGroup
  pathname: string
  pendingCount?: number
}) {
  return (
    <div>
      {group.groupLabel && (
        <p className="px-5 pt-4 pb-1 text-purple-300/60 text-[11px] uppercase tracking-widest font-mono font-medium">
          {group.groupLabel}
        </p>
      )}
      {group.items.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/dashboard" &&
            item.href !== "/my" &&
            item.href !== "/instructor" &&
            pathname.startsWith(item.href))
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`relative flex items-center gap-3 mx-2 px-3 py-2.5 rounded-xl text-sm transition-all duration-150
              ${isActive
                ? "bg-white/10 text-white font-semibold"
                : "text-purple-200/80 hover:bg-white/5 hover:text-white"
              }`}
          >
            {isActive && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-[#E8C96A]" aria-hidden="true" />
            )}
            <span className="text-base w-5 text-center">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.badge && pendingCount && pendingCount > 0 ? (
              <span className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center font-mono">
                {pendingCount > 9 ? "9+" : pendingCount}
              </span>
            ) : null}
          </Link>
        )
      })}
    </div>
  )
}

export default function Sidebar({
  userName,
  userRank,
  userUnit,
  variant = "admin",
  pendingCount,
}: SidebarProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  // ปิด drawer อัตโนมัติเมื่อเปลี่ยนหน้า (มือถือ)
  useEffect(() => { setOpen(false) }, [pathname])

  const mainGroups =
    variant === "instructor"
      ? instructorNavGroups
      : variant === "student"
      ? studentNavGroups
      : adminNavGroups

  const personalGroups =
    variant === "admin"
      ? adminPersonalGroups
      : variant === "instructor"
      ? instructorPersonalGroups
      : null

  return (
    <>
      {/* ปุ่ม hamburger — เฉพาะมือถือ */}
      <button
        type="button"
        aria-label="เปิดเมนู"
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-2.5 left-3 z-30 bg-[#2D0F42] text-white rounded-lg px-2.5 py-2 shadow-lg border border-[#4A1A6B] text-lg leading-none"
      >
        ☰
      </button>

      {/* ฉากหลังทึบเมื่อเปิด drawer */}
      {open && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`w-64 min-h-screen bg-gradient-to-b from-[#2D0F42] to-[#230a35] flex flex-col transform transition-transform duration-200 ease-out
          fixed inset-y-0 left-0 z-50 md:static md:z-auto md:translate-x-0
          ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
      {/* ปุ่มปิด — เฉพาะมือถือ */}
      <button
        type="button"
        aria-label="ปิดเมนู"
        onClick={() => setOpen(false)}
        className="md:hidden absolute top-3 right-3 text-purple-300 hover:text-white text-xl leading-none z-10"
      >
        ✕
      </button>

      {/* Logo */}
      <div className="flex flex-col items-center gap-3 px-6 py-7 border-b border-white/10">
        <div className="relative">
          <span
            className="absolute inset-0 rounded-full blur-md bg-[#C9A84C]/30 -z-10 scale-125"
            aria-hidden="true"
          />
          <Image
            src="/signal_logo.png"
            alt="กรมการทหารสื่อสาร"
            width={60}
            height={60}
            className="rounded-full border-2 border-[#C9A84C] bg-white p-0.5"
          />
        </div>
        <div className="text-center">
          <p className="text-white text-sm font-bold leading-tight">กรมการทหารสื่อสาร</p>
          <p className="text-[#E8C96A] text-xs mt-0.5 font-mono tracking-wide">
            {variant === "admin"
              ? "ผู้ดูแลระบบ"
              : variant === "instructor"
              ? "ครูอาจารย์"
              : "กรมทหารสื่อสาร"}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto space-y-0.5">
        {mainGroups.map((group, idx) => (
          <NavGroupSection
            key={idx}
            group={group}
            pathname={pathname}
            pendingCount={pendingCount}
          />
        ))}

        {personalGroups && (
          <div className="border-t border-white/10 mt-2 pt-1">
            {personalGroups.map((group, idx) => (
              <NavGroupSection
                key={idx}
                group={group}
                pathname={pathname}
              />
            ))}
          </div>
        )}
      </nav>

      {/* User */}
      {userName && (
        <div className="px-5 py-4 border-t border-white/10">
          <p className="text-white text-sm font-medium truncate">{userName}</p>
          {userRank && <p className="text-purple-300 text-xs">{userRank}</p>}
          {userUnit && <p className="text-purple-400 text-xs truncate">{userUnit}</p>}
          <button
            onClick={() => { fetch("/logout", { method: "GET", credentials: "include" }).finally(() => { window.location.href = "/login" }) }}
            className="block mt-2 text-purple-400 hover:text-white text-xs transition-colors text-left"
          >
            ออกจากระบบ →
          </button>
        </div>
      )}
    </aside>
    </>
  )
}
