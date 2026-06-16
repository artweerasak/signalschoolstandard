"use client"
import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { api, CurrentUser } from "@/lib/api"

const navItems = [
  { href: "/org-admin",        label: "ภาพรวม",          icon: "📊" },
  { href: "/org-admin/users",  label: "กำลังพลในสังกัด", icon: "👥" },
]

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

  if (loading) return <div className="flex h-screen items-center justify-center text-gray-400">กำลังโหลด...</div>

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-[#4A1A6B] text-white flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-purple-700 flex items-center gap-2">
          <Image src="/signal_logo.png" alt="logo" width={36} height={36} className="rounded-full" />
          <span className="font-bold text-sm leading-tight">ผู้ดูแลหน่วย<br/>(ฝอ.1)</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(item => (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors
                ${pathname === item.href ? "bg-white/20 font-medium" : "hover:bg-white/10"}`}>
              <span>{item.icon}</span>{item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-purple-700">
          <p className="text-xs text-purple-300 truncate">{user?.full_name || user?.username}</p>
          <Link href="/my" className="text-xs text-purple-400 hover:text-white mt-1 block">← กลับหน้าเรียน</Link>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
