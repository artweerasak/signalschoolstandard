"use client"
import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { api, CurrentUser } from "@/lib/api"
import Crest from "@/components/Crest"

const navItems = [
  { href: "/evaluator", label: "การประเมินผล", icon: "📊" },
]

const personalNavItems = [
  { href: "/my/courses",      label: "สมัครเรียนหลักสูตร", icon: "📚" },
  { href: "/my/certificates", label: "ใบประกาศของฉัน",     icon: "📜" },
  { href: "/my/profile",      label: "ข้อมูลส่วนตัว",       icon: "👤" },
]

export default function EvaluatorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.me()
      .then(u => {
        setUser(u)
        if (!u.is_staff && u.role !== "evaluator" && u.role !== "admin") {
          router.replace("/my")
        }
      })
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false))
  }, [router])

  if (loading) return <div className="flex h-screen items-center justify-center text-[#9a92a8]">กำลังโหลด...</div>

  return (
    <div className="flex h-screen bg-[#f7f5fa]">
      <aside className="w-56 bg-gradient-to-b from-[#2D0F42] to-[#230a35] text-white flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-white/10 flex items-center gap-2">
          <div className="relative shrink-0">
            <span className="absolute inset-0 rounded-full blur-md bg-[#C9A84C]/30 -z-10 scale-125" aria-hidden="true" />
            <Crest size={36} className="border border-[#C9A84C]/50" />
          </div>
          <span className="font-bold text-sm leading-tight">แผนกประเมินผล</span>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(item => (
            <Link key={item.href} href={item.href}
              className={`relative flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-all duration-150
                ${pathname === item.href ? "bg-white/10 font-medium" : "text-purple-200/80 hover:bg-white/5 hover:text-white"}`}>
              {pathname === item.href && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-[#E8C96A]" aria-hidden="true" />}
              <span>{item.icon}</span>{item.label}
            </Link>
          ))}
          <div className="border-t border-white/10 mt-2 pt-2">
            <p className="px-3 pb-1 text-purple-300/60 text-[11px] uppercase tracking-widest font-mono font-medium">ส่วนตัว</p>
            {personalNavItems.map(item => (
              <Link key={item.href} href={item.href}
                className={`relative flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-all duration-150
                  ${pathname === item.href ? "bg-white/10 font-medium" : "text-purple-200/80 hover:bg-white/5 hover:text-white"}`}>
                {pathname === item.href && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-[#E8C96A]" aria-hidden="true" />}
                <span>{item.icon}</span>{item.label}
              </Link>
            ))}
          </div>
        </nav>
        <div className="p-4 border-t border-white/10">
          <p className="text-xs text-purple-300 truncate">{user?.full_name || user?.username}</p>
          <button
            onClick={() => { fetch("/logout", { method: "GET", credentials: "include" }).finally(() => { window.location.href = "/login" }) }}
            className="block mt-2 text-purple-400 hover:text-white text-xs transition-colors text-left"
          >
            ออกจากระบบ →
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
