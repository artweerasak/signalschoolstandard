"use client"
import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { api, CurrentUser } from "@/lib/api"
import Crest from "@/components/Crest"

const SIGNAL_SCHOOL_ORG_ID = 161

const baseNavItems = [
  { href: "/org-admin",        label: "ภาพรวม",          icon: "📊" },
  { href: "/org-admin/users",  label: "กำลังพลในสังกัด", icon: "👥" },
  { href: "/org-admin/personnel-history", label: "ประวัติการเรียนกำลังพล", icon: "📖" },
]

const schoolNavItem = { href: "/org-admin/school-curricula", label: "หลักสูตร รร.ส.สส.", icon: "🎓" }

export default function OrgAdminLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [user, setUser]     = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.me()
      .then(u => {
        setUser(u)
        if (!u.is_staff && !["admin", "org_admin"].includes(u.role)) {
          router.replace("/my")
        }
      })
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false))
  }, [router])

  if (loading) return <div className="flex h-screen items-center justify-center text-[#9a92a8]">กำลังโหลด...</div>

  const navItems = user?.organization_id === SIGNAL_SCHOOL_ORG_ID
    ? [...baseNavItems, schoolNavItem]
    : baseNavItems

  return (
    <div className="flex h-screen bg-[#f7f5fa]">
      {/* Sidebar */}
      <aside className="w-56 bg-gradient-to-b from-[#2D0F42] to-[#230a35] text-white flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-white/10 flex items-center gap-2">
          <div className="relative shrink-0">
            <span className="absolute inset-0 rounded-full blur-md bg-[#C9A84C]/30 -z-10 scale-125" aria-hidden="true" />
            <Crest size={36} className="border border-[#C9A84C]/50" />
          </div>
          <span className="font-bold text-sm leading-tight">ผู้ดูแลหน่วย<br/>(ฝอ.1)</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(item => (
            <Link key={item.href} href={item.href}
              className={`relative flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-all duration-150
                ${pathname === item.href ? "bg-white/10 font-medium" : "text-purple-200/80 hover:bg-white/5 hover:text-white"}`}>
              {pathname === item.href && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-[#E8C96A]" aria-hidden="true" />}
              <span>{item.icon}</span>{item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10">
          <p className="text-xs text-purple-300 truncate">{user?.full_name || user?.username}</p>
          <Link href="/my" className="text-xs text-purple-400 hover:text-white mt-1 block">← กลับหน้าเรียน</Link>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
