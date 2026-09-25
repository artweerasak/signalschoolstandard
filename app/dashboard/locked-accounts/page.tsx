"use client"
import { useEffect, useState, useCallback } from "react"

interface LockedAccount {
  id: number
  user_id: number
  username: string
  full_name: string
  unit: string
  failure_count: number
  lockout_until: string
  remaining_seconds: number
}

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return "หมดเวลาล็อกแล้ว"
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `เหลืออีก ${m} นาที ${s} วินาที`
}

export default function LockedAccountsPage() {
  const [accounts, setAccounts] = useState<LockedAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [unlockingId, setUnlockingId] = useState<number | null>(null)
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/military/api/v1/admin/locked-accounts/", { credentials: "include" })
      const d = await res.json()
      setAccounts(d.results || [])
    } catch { } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // อัปเดตนับถอยหลังในหน้าทุกวินาที โดยไม่ต้องยิง API ซ้ำ
  useEffect(() => {
    const t = setInterval(() => {
      setAccounts(prev => prev.map(a => ({ ...a, remaining_seconds: Math.max(a.remaining_seconds - 1, 0) })))
    }, 1000)
    return () => clearInterval(t)
  }, [])

  async function handleUnlock(a: LockedAccount) {
    if (!confirm(`ปลดล็อกบัญชี "${a.full_name}" (${a.username}) เลยตอนนี้?\nไม่ต้องรอครบเวลาล็อกอัตโนมัติ`)) return
    setUnlockingId(a.user_id)
    setMsg(null)
    try {
      const res = await fetch(`/military/api/v1/admin/locked-accounts/${a.user_id}/unlock/`, {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRFToken": getCsrf() },
      })
      const d = await res.json()
      if (res.ok) {
        setMsg({ type: "ok", text: `✅ ${d.message}` })
        setAccounts(prev => prev.filter(x => x.user_id !== a.user_id))
      } else {
        setMsg({ type: "err", text: "❌ " + (d.error || "เกิดข้อผิดพลาด") })
      }
    } catch {
      setMsg({ type: "err", text: "❌ เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" })
    } finally {
      setUnlockingId(null)
    }
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#2D0F42]">🔓 บัญชีที่ถูกล็อก</h1>
          <p className="text-sm text-[#6b6478] mt-1">
            บัญชีที่กรอกรหัสผ่านผิดเกินจำนวนครั้งที่กำหนด ระบบจะล็อกอัตโนมัติชั่วคราว —
            ปลดล็อกเองได้ทันทีโดยไม่ต้องรอครบเวลา
          </p>
        </div>
        <button onClick={load} className="text-sm text-purple-700 hover:underline whitespace-nowrap">
          🔄 รีเฟรช
        </button>
      </div>

      {msg && (
        <div className={`px-4 py-2 rounded-lg text-sm ${msg.type === "ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {msg.text}
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#e6e1ee] shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-[#9a92a8]">กำลังโหลด...</div>
        ) : accounts.length === 0 ? (
          <div className="p-12 text-center text-[#9a92a8]">✅ ไม่มีบัญชีที่ถูกล็อกอยู่ในขณะนี้</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#f5f3f7] text-[#4A1A6B]">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">ชื่อ-สกุล</th>
                <th className="px-4 py-3 text-left font-semibold">Username (เลขบัตร ปชช.)</th>
                <th className="px-4 py-3 text-left font-semibold">หน่วย</th>
                <th className="px-4 py-3 text-center font-semibold">กรอกผิด (ครั้ง)</th>
                <th className="px-4 py-3 text-left font-semibold">เวลาล็อก</th>
                <th className="px-4 py-3 text-center font-semibold">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0ecf6]">
              {accounts.map(a => (
                <tr key={a.id} className="hover:bg-[#f7f5fa]">
                  <td className="px-4 py-3 font-medium text-[#2D0F42]">{a.full_name}</td>
                  <td className="px-4 py-3 font-mono text-[#6b6478]">{a.username}</td>
                  <td className="px-4 py-3 text-[#6b6478]">{a.unit}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                      {a.failure_count} ครั้ง
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#6b6478] text-xs">{formatRemaining(a.remaining_seconds)}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleUnlock(a)}
                      disabled={unlockingId === a.user_id}
                      className="bg-[#4A1A6B] text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-[#3a1255] disabled:opacity-50"
                    >
                      {unlockingId === a.user_id ? "กำลังปลดล็อก..." : "ปลดล็อกทันที"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function getCsrf(): string {
  if (typeof document === "undefined") return ""
  return document.cookie.split(";").find(c => c.trim().startsWith("csrftoken="))?.split("=")[1] ?? ""
}
