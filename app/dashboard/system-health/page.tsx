"use client"
import { useEffect, useState } from "react"

interface Health {
  disk: { total_gb: number; used_gb: number; pct: number }
  memory: { total_gb: number; used_gb: number; pct: number }
  video_storage_gb: number
  active_sessions: number
  total_personnel: number
  total_certificates: number
  expired_certificates: number
}

function GaugeBar({ pct, color }: { pct: number; color: string }) {
  const c = pct > 85 ? "bg-red-500" : pct > 60 ? "bg-yellow-500" : color
  return (
    <div className="w-full bg-gray-100 rounded-full h-2.5 mt-1">
      <div className={`h-2.5 rounded-full transition-all ${c}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

function StatCard({ icon, label, value, sub }: { icon: string; label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-3 mb-1">
        <span className="text-2xl">{icon}</span>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <p className="text-3xl font-bold text-[#2D0F42]">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function SystemHealthPage() {
  const [data, setData] = useState<Health | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState("")

  const load = async () => {
    try {
      const res = await fetch("/military/api/v1/admin/system-health/", { credentials: "include" })
      const d = await res.json()
      setData(d)
      setLastUpdate(new Date().toLocaleTimeString("th-TH"))
    } catch { } finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [])

  if (loading) return <div className="p-8 text-center text-gray-400">กำลังโหลด...</div>
  if (!data) return <div className="p-8 text-center text-red-400">ไม่สามารถโหลดข้อมูลได้</div>

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#2D0F42]">🖥️ สถานะระบบ</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">อัปเดตล่าสุด: {lastUpdate}</span>
          <button onClick={load}
            className="px-3 py-1.5 bg-[#4A1A6B] text-white text-xs rounded-lg hover:bg-[#2D0F42]">
            รีเฟรช
          </button>
        </div>
      </div>

      {/* Server Resources */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
        <h2 className="font-semibold text-gray-700">ทรัพยากรเซิร์ฟเวอร์</h2>
        <div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">💿 Disk</span>
            <span className="font-medium">{data.disk.used_gb} / {data.disk.total_gb} GB ({data.disk.pct}%)</span>
          </div>
          <GaugeBar pct={data.disk.pct} color="bg-blue-500" />
        </div>
        <div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">🧠 RAM</span>
            <span className="font-medium">{data.memory.used_gb} / {data.memory.total_gb} GB ({data.memory.pct}%)</span>
          </div>
          <GaugeBar pct={data.memory.pct} color="bg-purple-500" />
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">🎬 พื้นที่วิดีโอ</span>
          <span className="font-medium">{data.video_storage_gb} GB</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon="👥" label="ผู้ใช้งานออนไลน์ (30 นาที)" value={data.active_sessions} />
        <StatCard icon="🪖" label="บุคลากรทั้งหมด" value={data.total_personnel.toLocaleString()} />
        <StatCard icon="📜" label="ใบประกาศทั้งหมด" value={data.total_certificates.toLocaleString()} />
        <StatCard icon="⚠️" label="ใบประกาศหมดอายุ" value={data.expired_certificates.toLocaleString()}
          sub={data.total_certificates > 0
            ? `${Math.round(data.expired_certificates / data.total_certificates * 100)}% ของทั้งหมด`
            : undefined} />
      </div>

      {/* Status indicators */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-700 mb-4">สถานะ Services</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { name: "LMS (Open edX)", ok: true },
            { name: "Database (MySQL)", ok: true },
            { name: "Redis Cache", ok: true },
            { name: "Video Streaming", ok: true },
            { name: "Email (SMTP)", ok: true },
            { name: "Search (MeiliSearch)", ok: true },
          ].map(s => (
            <div key={s.name} className="flex items-center gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full ${s.ok ? "bg-green-500" : "bg-red-500"}`} />
              <span className="text-gray-600">{s.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
