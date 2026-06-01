"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useRouter, usePathname } from "next/navigation"
import { logout } from "@/lib/auth"

const IDLE_MINUTES = 30       // แจ้งเตือนหลัง idle 30 นาที
const WARNING_SECONDS = 60    // นับถอยหลัง 60 วินาทีก่อน logout

const PUBLIC_PATHS = ["/login", "/register", "/privacy"]

export default function SessionTimeout() {
  const router = useRouter()
  const pathname = usePathname()
  const [showWarning, setShowWarning] = useState(false)
  const [countdown, setCountdown] = useState(WARNING_SECONDS)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const countdownTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))

  const doLogout = useCallback(async () => {
    setShowWarning(false)
    await logout()
    router.replace("/login?reason=timeout")
  }, [router])

  const resetIdle = useCallback(() => {
    if (isPublic) return
    clearTimeout(idleTimer.current)
    clearInterval(countdownTimer.current)
    if (showWarning) setShowWarning(false)
    idleTimer.current = setTimeout(() => {
      setShowWarning(true)
      setCountdown(WARNING_SECONDS)
      let c = WARNING_SECONDS
      countdownTimer.current = setInterval(() => {
        c -= 1
        setCountdown(c)
        if (c <= 0) {
          clearInterval(countdownTimer.current)
          doLogout()
        }
      }, 1000)
    }, IDLE_MINUTES * 60 * 1000)
  }, [isPublic, showWarning, doLogout])

  const stayLoggedIn = () => {
    clearInterval(countdownTimer.current)
    setShowWarning(false)
    resetIdle()
  }

  useEffect(() => {
    if (isPublic) return
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"]
    events.forEach(e => window.addEventListener(e, resetIdle, { passive: true }))
    resetIdle()
    return () => {
      events.forEach(e => window.removeEventListener(e, resetIdle))
      clearTimeout(idleTimer.current)
      clearInterval(countdownTimer.current)
    }
  }, [isPublic, resetIdle])

  if (!showWarning) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center space-y-4">
        <div className="text-5xl">⏰</div>
        <h2 className="text-lg font-bold text-gray-800">เซสชันใกล้หมดอายุ</h2>
        <p className="text-gray-500 text-sm">
          ระบบจะออกจากระบบอัตโนมัติใน
        </p>
        <div className="text-4xl font-black text-[#4A1A6B]">{countdown}</div>
        <p className="text-gray-400 text-xs">วินาที</p>
        <div className="flex gap-3 justify-center pt-2">
          <button onClick={stayLoggedIn}
            className="flex-1 py-2.5 bg-[#4A1A6B] text-white rounded-lg font-semibold text-sm hover:bg-[#2D0F42] transition">
            อยู่ต่อ
          </button>
          <button onClick={doLogout}
            className="flex-1 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition">
            ออกจากระบบ
          </button>
        </div>
      </div>
    </div>
  )
}
