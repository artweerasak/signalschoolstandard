"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"

interface Notification {
  id: string
  type: "warning" | "error" | "info"
  title: string
  message: string
  link: string
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch("/military/api/v1/my/notifications/", { credentials: "include" })
      .then(r => r.json())
      .then(d => setNotifications(d.notifications || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const visible = notifications.filter(n => !dismissed.has(n.id))
  const unread = visible.length

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition">
        <span className="text-xl">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="font-semibold text-gray-700 text-sm">การแจ้งเตือน</span>
            {unread > 0 && (
              <button onClick={() => setDismissed(new Set(notifications.map(n => n.id)))}
                className="text-xs text-gray-400 hover:text-gray-600">
                ล้างทั้งหมด
              </button>
            )}
          </div>
          {visible.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">ไม่มีการแจ้งเตือน</div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
              {visible.map(n => (
                <div key={n.id} className="px-4 py-3 flex items-start gap-3 hover:bg-gray-50">
                  <span className="text-lg shrink-0">{n.type === "error" ? "🔴" : n.type === "warning" ? "🟡" : "🔵"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-700">{n.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.message}</p>
                    <Link href={n.link} onClick={() => setOpen(false)}
                      className="text-xs text-[#4A1A6B] hover:underline mt-1 inline-block">
                      ดูรายละเอียด →
                    </Link>
                  </div>
                  <button onClick={() => setDismissed(d => new Set([...d, n.id]))}
                    className="text-gray-300 hover:text-gray-500 text-xs shrink-0">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
