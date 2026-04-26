/**
 * app/my/profile/page.tsx
 * หน้าข้อมูลส่วนตัวของกำลังพล
 */
"use client"

import { useEffect, useState } from "react"
import { api, MyProfile } from "@/lib/api"

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex gap-4 py-3 border-b border-gray-50 last:border-0">
      <span className="text-gray-400 text-sm w-36 shrink-0">{label}</span>
      <span className="text-gray-800 text-sm font-medium">{value ?? "—"}</span>
    </div>
  )
}

export default function MyProfilePage() {
  const [profile, setProfile] = useState<MyProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.myProfile().then(setProfile).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="max-w-xl space-y-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-2xl font-bold text-[#2D0F42]">ข้อมูลส่วนตัว</h2>
        <p className="text-gray-500 text-sm mt-1">ข้อมูลประจำตัวในระบบ</p>
      </div>

      {/* Avatar card */}
      <div className="bg-gradient-to-r from-[#4A1A6B] to-[#7B3FA0] rounded-xl p-6 text-white flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-3xl font-bold">
          {profile?.full_name?.charAt(0) ?? "?"}
        </div>
        <div>
          <p className="text-xl font-bold">{profile?.rank_display} {profile?.full_name}</p>
          <p className="text-purple-200 text-sm mt-0.5">{profile?.unit}</p>
          {profile?.sub_unit && <p className="text-purple-300 text-xs">{profile.sub_unit}</p>}
        </div>
      </div>

      {/* Info table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-2">
        <InfoRow label="ชื่อ-นามสกุล" value={profile?.full_name} />
        <InfoRow label="ชั้นยศ" value={profile?.rank_display} />
        <InfoRow label="หน่วยต้นสังกัด" value={profile?.unit} />
        <InfoRow label="หน่วยรอง" value={profile?.sub_unit || "—"} />
        <InfoRow label="อายุ" value={profile?.age != null ? `${profile.age} ปี` : null} />
        <InfoRow label="อายุราชการ" value={profile?.service_years != null ? `${profile.service_years} ปี` : null} />
        <InfoRow label="วันเริ่มรับราชการ"
          value={profile?.service_start_date
            ? new Date(profile.service_start_date).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })
            : null} />
        <InfoRow label="อีเมล" value={profile?.email} />
      </div>

      <p className="text-xs text-gray-400 text-center">
        หากข้อมูลไม่ถูกต้อง กรุณาติดต่อเจ้าหน้าที่ฝ่ายบุคลากร
      </p>
    </div>
  )
}
