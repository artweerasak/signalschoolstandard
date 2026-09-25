"use client"

import { useEffect, useState } from "react"
import { api, MyProfile, notifyProfileUpdated } from "@/lib/api"

function getCookie(name: string) {
  const v = document.cookie.match("(^|;) ?" + name + "=([^;]*)(;|$)")
  return v ? v[2] : null
}

function EditDatesSection({ profile, onDone }: { profile: MyProfile; onDone: () => void }) {
  const parseDate = (val: string | null | undefined): string => {
    if (!val) return ""
    try {
      const d = new Date(val)
      if (isNaN(d.getTime()) || d.getFullYear() < 1900) return ""
      return d.toISOString().split("T")[0]
    } catch { return "" }
  }

  const formatDateTH = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })
    } catch { return iso }
  }

  const initBirth = parseDate((profile as any).birth_date)
  const initSSD   = parseDate((profile as any).service_start_date)
  const hasAll    = !!initBirth && !!initSSD

  const [editing,  setEditing]  = useState(!hasAll)
  const [form,     setForm]     = useState({ birth_date: initBirth, service_start_date: initSSD })
  // ค่าที่บันทึกจริง — ใช้แสดงผลทันทีหลังบันทึก ไม่ต้องรอ profile prop รีเฟรชจากพ่อ (กันหน้าจอโชว์ "—" ชั่วคราว/ค้างถ้า reload ล้มเหลว)
  const [saved,    setSaved]    = useState({ birth_date: initBirth, service_start_date: initSSD })
  const [saving,   setSaving]   = useState(false)
  const [success,  setSuccess]  = useState(false)
  const [error,    setError]    = useState("")

  // ซิงค์เมื่อ profile prop เปลี่ยนจากภายนอก (เช่น โหลดครั้งแรก หรือแอดมินแก้ไขให้)
  useEffect(() => {
    setForm({ birth_date: initBirth, service_start_date: initSSD })
    setSaved({ birth_date: initBirth, service_start_date: initSSD })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initBirth, initSSD])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!form.birth_date) { setError("กรุณากรอกวันเกิด"); return }
    if (!form.service_start_date) { setError("กรุณากรอกวันเริ่มรับราชการ"); return }
    setSaving(true)
    try {
      const res = await fetch("/military/api/v1/my/profile/complete/", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRFToken": getCookie("csrftoken") || "" },
        body: JSON.stringify({ birth_date: form.birth_date, service_start_date: form.service_start_date }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ")
      setSaved({ birth_date: form.birth_date, service_start_date: form.service_start_date })
      setSuccess(true)
      setEditing(false)
      onDone()
      notifyProfileUpdated()
      setTimeout(() => setSuccess(false), 3000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-[#2D0F42]">วันเกิดและวันเริ่มรับราชการ</h3>
          <button onClick={() => { setEditing(true); setSuccess(false) }}
            className="text-sm text-[#7B3FA0] hover:underline">แก้ไข</button>
        </div>
        {success && <p className="text-green-600 text-sm mb-2">✓ บันทึกแล้ว</p>}
        <div className="space-y-2 text-sm">
          <div className="flex gap-4">
            <span className="text-gray-400 w-36 shrink-0">วันเกิด</span>
            <span className="text-gray-800 font-medium">{saved.birth_date ? formatDateTH(saved.birth_date) : "—"}</span>
          </div>
          <div className="flex gap-4">
            <span className="text-gray-400 w-36 shrink-0">วันเริ่มรับราชการ</span>
            <span className="text-gray-800 font-medium">{saved.service_start_date ? formatDateTH(saved.service_start_date) : "—"}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-[#7B3FA0] shadow-sm px-6 py-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-[#2D0F42]">วันเกิดและวันเริ่มรับราชการ</h3>
          {!hasAll && <p className="text-xs text-amber-600 mt-0.5">กรุณากรอกข้อมูลเพื่อให้ระบบคำนวณอายุและอายุราชการได้ถูกต้อง</p>}
        </div>
        {hasAll && (
          <button onClick={() => setEditing(false)} className="text-sm text-gray-400 hover:text-gray-600">ยกเลิก</button>
        )}
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm text-gray-600 mb-1">
            วันเกิด {!initBirth && <span className="text-red-500">*</span>}
          </label>
          <input type="date" value={form.birth_date}
            onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))}
            max={new Date().toISOString().split("T")[0]}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7B3FA0]" />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">
            วันเริ่มรับราชการ {!initSSD && <span className="text-red-500">*</span>}
          </label>
          <input type="date" value={form.service_start_date}
            onChange={e => setForm(f => ({ ...f, service_start_date: e.target.value }))}
            max={new Date().toISOString().split("T")[0]}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7B3FA0]" />
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button type="submit" disabled={saving}
          className="bg-[#4A1A6B] hover:bg-[#2D0F42] disabled:opacity-50 text-white text-sm font-medium px-6 py-2 rounded-lg transition">
          {saving ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
        </button>
      </form>
    </div>
  )
}

function EditContactSection({ profile, onDone }: { profile: MyProfile; onDone: () => void }) {
  const [form, setForm] = useState({
    contact_email: (profile as any).contact_email ?? "",
    phone_number:  (profile as any).phone_number  ?? "",
  })
  const [saving,  setSaving]  = useState(false)
  const [success, setSuccess] = useState(false)
  const [error,   setError]   = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSaving(true)
    try {
      const res = await fetch("/military/api/v1/my/profile/complete/", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRFToken": getCookie("csrftoken") || "" },
        body: JSON.stringify({ contact_email: form.contact_email, phone_number: form.phone_number }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ")
      setSuccess(true)
      onDone()
      setTimeout(() => setSuccess(false), 3000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-6">
      <h3 className="font-semibold text-[#2D0F42] mb-1">ข้อมูลการติดต่อ</h3>
      <p className="text-xs text-gray-400 mb-4">อีเมลและเบอร์โทรที่ระบุจะใช้สำหรับแจ้งข่าวสารจากระบบ</p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm text-gray-600 mb-1">อีเมลติดต่อ</label>
          <input type="email" value={form.contact_email}
            onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))}
            placeholder="example@army.mi.th"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7B3FA0]" />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">เบอร์โทรศัพท์</label>
          <input type="tel" value={form.phone_number}
            onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))}
            placeholder="08XXXXXXXX"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7B3FA0]" />
        </div>
        {error   && <p className="text-red-500 text-sm">{error}</p>}
        {success && <p className="text-green-600 text-sm">✓ บันทึกแล้ว</p>}
        <button type="submit" disabled={saving}
          className="bg-[#4A1A6B] hover:bg-[#2D0F42] disabled:opacity-50 text-white text-sm font-medium px-6 py-2 rounded-lg transition">
          {saving ? "กำลังบันทึก..." : "บันทึกข้อมูลติดต่อ"}
        </button>
      </form>
    </div>
  )
}

function EditGenderSection({ profile, onDone }: { profile: MyProfile; onDone: () => void }) {
  const [gender, setGender] = useState<"M" | "F">((profile as any).gender === "F" ? "F" : "M")
  const [saving,  setSaving]  = useState(false)
  const [success, setSuccess] = useState(false)
  const [error,   setError]   = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSaving(true)
    try {
      const res = await fetch("/military/api/v1/my/profile/complete/", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRFToken": getCookie("csrftoken") || "" },
        body: JSON.stringify({ gender }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ")
      setSuccess(true)
      onDone()
      notifyProfileUpdated()
      setTimeout(() => setSuccess(false), 3000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-6">
      <h3 className="font-semibold text-[#2D0F42] mb-1">เพศ</h3>
      <p className="text-xs text-gray-400 mb-4">ใช้สำหรับแสดงคำลงท้ายยศ "หญิง" ให้ถูกต้องในเอกสาร/ใบประกาศ</p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-3">
          {(["M", "F"] as const).map((g) => (
            <label key={g}
              className={`flex-1 flex items-center justify-center gap-2 border rounded-lg py-2.5 text-sm cursor-pointer transition-colors
                ${gender === g ? "border-[#7B3FA0] bg-purple-50 text-[#4A1A6B] font-medium" : "border-gray-300 text-gray-600"}`}>
              <input type="radio" name="gender" className="sr-only"
                checked={gender === g} onChange={() => setGender(g)} />
              {g === "M" ? "ชาย" : "หญิง"}
            </label>
          ))}
        </div>
        {error   && <p className="text-red-500 text-sm">{error}</p>}
        {success && <p className="text-green-600 text-sm">✓ บันทึกแล้ว</p>}
        <button type="submit" disabled={saving || gender === (profile as any).gender}
          className="bg-[#4A1A6B] hover:bg-[#2D0F42] disabled:opacity-50 text-white text-sm font-medium px-6 py-2 rounded-lg transition">
          {saving ? "กำลังบันทึก..." : "บันทึกเพศ"}
        </button>
      </form>
    </div>
  )
}

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

  function loadProfile() {
    api.myProfile()
      .then(setProfile)
      .catch((err) => console.error("โหลดโปรไฟล์ไม่สำเร็จ:", err))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadProfile() }, [])

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
          {(profile as any)?.thaid_verified && (
            <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full bg-white/20 text-white text-xs font-medium">🪪 ThaID ยืนยันตัวตนแล้ว</span>
          )}
        </div>
      </div>

      {/* Info table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-2">
        <InfoRow label="ชื่อ-นามสกุล" value={profile?.full_name} />
        <InfoRow label="ชั้นยศ" value={profile?.rank_display} />
        <InfoRow label="เพศ" value={(profile as any)?.gender_display} />
        <InfoRow label="หน่วยต้นสังกัด" value={profile?.unit} />
        <InfoRow label="หน่วยรอง" value={profile?.sub_unit || "—"} />
        <InfoRow label="อายุ" value={profile?.age != null ? `${profile.age} ปี` : null} />
        <InfoRow label="อายุราชการ" value={profile?.service_years != null ? `${profile.service_years} ปี` : null} />
        <InfoRow label="วันเริ่มรับราชการ"
          value={(() => {
            if (!profile?.service_start_date) return null
            try {
              const d = new Date(profile.service_start_date)
              if (isNaN(d.getTime()) || d.getFullYear() < 1900) return null
              return d.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })
            } catch { return null }
          })()} />
        <InfoRow label="อีเมล" value={profile?.email} />
        <InfoRow label="การยืนยันตัวตน" value={(profile as any)?.thaid_verified ? "🪪 ThaID ยืนยันแล้ว" : "—"} />
      </div>

      {/* Edit Dates */}
      {profile && <EditDatesSection profile={profile} onDone={loadProfile} />}

      {/* Edit Gender */}
      {profile && <EditGenderSection profile={profile} onDone={loadProfile} />}

      {/* Edit Contact Info */}
      {profile && <EditContactSection profile={profile} onDone={loadProfile} />}

      {/* Change Password */}
      <ChangePasswordSection />

      <p className="text-xs text-gray-400 text-center">
        หากข้อมูลไม่ถูกต้อง กรุณาติดต่อเจ้าหน้าที่ฝ่ายบุคลากร
      </p>
    </div>
  )
}
