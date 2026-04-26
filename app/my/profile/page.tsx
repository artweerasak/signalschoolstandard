/**
 * app/my/profile/page.tsx
 * หน้าข้อมูลส่วนตัวของกำลังพล + เปลี่ยนรหัสผ่าน
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

function ChangePasswordSection() {
  const [form, setForm] = useState({ current_password: "", new_password: "", confirm_password: "" })
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState("")
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSuccess("")
    setError("")
    if (form.new_password !== form.confirm_password) {
      setError("รหัสผ่านใหม่ไม่ตรงกัน")
      return
    }
    if (form.new_password.length < 8) {
      setError("รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร")
      return
    }
    setSaving(true)
    try {
      const res = await api.changePassword(form)
      setSuccess(res.message)
      setForm({ current_password: "", new_password: "", confirm_password: "" })
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-6">
      <h3 className="font-semibold text-[#2D0F42] mb-4">เปลี่ยนรหัสผ่าน</h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm text-gray-600 mb-1">รหัสผ่านปัจจุบัน</label>
          <input
            type="password"
            value={form.current_password}
            onChange={(e) => setForm(f => ({ ...f, current_password: e.target.value }))}
            placeholder="รหัสผ่านปัจจุบัน (หรือเลขทหาร 10 หลัก)"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7B3FA0]"
            required
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">รหัสผ่านใหม่</label>
          <input
            type="password"
            value={form.new_password}
            onChange={(e) => setForm(f => ({ ...f, new_password: e.target.value }))}
            placeholder="อย่างน้อย 8 ตัวอักษร"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7B3FA0]"
            required
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">ยืนยันรหัสผ่านใหม่</label>
          <input
            type="password"
            value={form.confirm_password}
            onChange={(e) => setForm(f => ({ ...f, confirm_password: e.target.value }))}
            placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7B3FA0]"
            required
          />
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        {success && <p className="text-green-600 text-sm">{success}</p>}
        <button
          type="submit"
          disabled={saving}
          className="bg-[#4A1A6B] hover:bg-[#2D0F42] disabled:bg-[#9B7AB8] text-white text-sm font-medium px-6 py-2 rounded-lg transition"
        >
          {saving ? "กำลังบันทึก..." : "เปลี่ยนรหัสผ่าน"}
        </button>
      </form>
      <p className="text-xs text-gray-400 mt-3">
        หากลืมรหัสผ่าน กรุณาติดต่อผู้ดูแลระบบเพื่อรีเซ็ตเป็น default (เลขทหาร)
      </p>
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

      {/* Change Password */}
      <ChangePasswordSection />

      <p className="text-xs text-gray-400 text-center">
        หากข้อมูลไม่ถูกต้อง กรุณาติดต่อเจ้าหน้าที่ฝ่ายบุคลากร
      </p>
    </div>
  )
}
