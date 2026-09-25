/**
 * app/prep-school/page.tsx
 * รายการหลักสูตรประจำปี/รุ่น ของหน่วย — สร้าง/แก้ไข/ส่งต่อแผนกเตรียมพล
 */
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { api, CurriculumSummary } from "@/lib/api"
import Card from "@/components/ui/Card"
import PageHeader from "@/components/ui/PageHeader"
import Button from "@/components/ui/Button"
import StatusPill from "@/components/ui/StatusPill"

const STATUS_LABELS: Record<string, string> = {
  draft: "ร่าง",
  submitted: "ส่งให้แผนกเตรียมพลแล้ว",
  active: "ใช้งาน",
  closed: "ปิดรุ่น",
}
const STATUS_TONES: Record<string, "neutral" | "warning" | "success" | "error"> = {
  draft: "neutral",
  submitted: "warning",
  active: "success",
  closed: "error",
}

// ต้องตรงกับ RANK_CHOICES/PERSONNEL_TYPE_CHOICES ใน military_profile/models.py เป๊ะ
const RANK_CHOICES = [
  ["PVT","พลทหาร"],["CPL","สิบตรี"],["SGT3","สิบโท"],["SGT2","สิบเอก"],
  ["SSGT","จ่าสิบตรี"],["MSGT","จ่าสิบโท"],["CSGT","จ่าสิบเอก"],["CSGT_S","จ่าสิบเอกพิเศษ"],
  ["WO1","พันจ่าตรี"],["WO2","พันจ่าโท"],["WO3","พันจ่าเอก"],
  ["2LT","ร้อยตรี"],["1LT","ร้อยโท"],["CPT","ร้อยเอก"],
  ["MAJ","พันตรี"],["LTCOL","พันโท"],["COL","พันเอก"],["COL_S","พันเอกพิเศษ"],
  ["BGEN","พลตรี"],["MGEN","พลโท"],["GEN","พลเอก"],
]
const PERSONNEL_TYPE_CHOICES = [
  ["military", "ทหาร"], ["civilian", "ลูกจ้างประจำ"], ["government", "พนักงานราชการ"],
]

interface FormData {
  name: string
  batch_code: string
  academic_year: number
  start_date: string
  end_date: string
  eligible_rank_class: string
  eligible_rank_min: string
  eligible_rank_max: string
  eligible_min_years_in_rank: string
  eligible_personnel_type: string
  quota_total: number
}
const EMPTY_FORM: FormData = {
  name: "", batch_code: "", academic_year: new Date().getFullYear() + 543,
  start_date: "", end_date: "",
  eligible_rank_class: "", eligible_rank_min: "", eligible_rank_max: "",
  eligible_min_years_in_rank: "", eligible_personnel_type: "", quota_total: 0,
}

export default function PrepSchoolPage() {
  const [curricula, setCurricula] = useState<CurriculumSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")

  const load = () => {
    setLoading(true)
    api.listCurricula()
      .then(r => setCurricula(r.results))
      .catch(() => setError("ไม่สามารถโหลดข้อมูลได้"))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openAdd = () => {
    setForm(EMPTY_FORM)
    setFormError("")
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError("กรุณากรอกชื่อหลักสูตร"); return }
    if (!form.batch_code.trim()) { setFormError("กรุณากรอกรุ่นที่"); return }
    if (form.start_date && form.end_date && form.start_date > form.end_date) {
      setFormError("วันเริ่มหลักสูตรต้องไม่หลังวันจบหลักสูตร"); return
    }
    setSaving(true)
    setFormError("")
    try {
      await api.createCurriculum({
        ...form,
        eligible_min_years_in_rank: form.eligible_min_years_in_rank
          ? Number(form.eligible_min_years_in_rank) : null,
      })
      setShowModal(false)
      load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="หลักสูตรของหน่วย"
        description="สร้างกรอบหลักสูตรประจำปี/รุ่น แล้วส่งต่อแผนกเตรียมพลเพื่อบรรจุกำลังพล"
        action={<Button onClick={openAdd}>+ สร้างหลักสูตรใหม่</Button>}
      />

      {error && (
        <div className="bg-[#fee2e2] border border-[#f3a0a0] text-[#b91c1c] px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[#9a92a8]">กำลังโหลด...</div>
        ) : curricula.length === 0 ? (
          <div className="py-16 text-center text-[#9a92a8]">
            <p className="text-lg mb-2">ยังไม่มีหลักสูตร</p>
            <p className="text-sm">คลิก &ldquo;สร้างหลักสูตรใหม่&rdquo; เพื่อเริ่มต้น</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e6e1ee] bg-[#f7f5fa] text-left text-xs text-[#6b6478] uppercase">
                <th className="px-4 py-3">ชื่อหลักสูตร</th>
                <th className="px-4 py-3">รุ่น</th>
                <th className="px-4 py-3">ปีการศึกษา</th>
                <th className="px-4 py-3">จำนวนวิชา</th>
                <th className="px-4 py-3">โควตา</th>
                <th className="px-4 py-3">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {curricula.map(c => (
                <tr key={c.id} className="border-b border-[#f0ecf6] hover:bg-[#f7f5fa]">
                  <td className="px-4 py-3">
                    <Link href={`/prep-school/curricula/${c.id}`} className="text-[#4A1A6B] font-medium hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[#6b6478]">{c.batch_code}</td>
                  <td className="px-4 py-3 text-[#6b6478]">{c.academic_year}</td>
                  <td className="px-4 py-3 text-[#6b6478]">{c.course_count}</td>
                  <td className="px-4 py-3 text-[#6b6478]">{c.quota_total}</td>
                  <td className="px-4 py-3">
                    <StatusPill tone={STATUS_TONES[c.status] || "neutral"}>
                      {STATUS_LABELS[c.status] || c.status}
                    </StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-[#e6e1ee] flex items-center justify-between">
              <h3 className="font-bold text-[#2D0F42]">สร้างหลักสูตรใหม่</h3>
              <button onClick={() => setShowModal(false)} className="text-[#9a92a8] hover:text-[#6b6478]">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && (
                <div className="bg-[#fee2e2] border border-[#f3a0a0] text-[#b91c1c] px-3 py-2 rounded-xl text-sm">{formError}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-[#4a4456] mb-1">ชื่อหลักสูตร</label>
                <input type="text" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">รุ่นที่</label>
                  <input type="text" value={form.batch_code}
                    onChange={e => setForm({ ...form, batch_code: e.target.value })}
                    className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">ปีการศึกษา (พ.ศ.)</label>
                  <input type="number" value={form.academic_year}
                    onChange={e => setForm({ ...form, academic_year: Number(e.target.value) })}
                    className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">วันเริ่มหลักสูตร (ไม่บังคับ)</label>
                  <input type="date" value={form.start_date}
                    onChange={e => setForm({ ...form, start_date: e.target.value })}
                    className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">วันจบหลักสูตร (ไม่บังคับ)</label>
                  <input type="date" value={form.end_date}
                    onChange={e => setForm({ ...form, end_date: e.target.value })}
                    className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
              </div>
              <div className="border-t border-[#e6e1ee] pt-4">
                <p className="text-sm font-semibold text-[#2D0F42] mb-1">คุณสมบัติผู้เข้าเรียน (ไม่บังคับ)</p>
                <p className="text-xs text-[#9a92a8] mb-3">ใช้คำนวณจำนวนกำลังพลที่เข้าเกณฑ์ในรายงานความคับคั่งของแผนกเตรียมพล — เว้นว่างช่องไหน = ไม่จำกัดด้านนั้น</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-[#4a4456] mb-1">ยศต่ำสุด</label>
                    <select value={form.eligible_rank_min}
                      onChange={e => setForm({ ...form, eligible_rank_min: e.target.value })}
                      className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B] bg-white">
                      <option value="">ไม่จำกัด</option>
                      {RANK_CHOICES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4a4456] mb-1">ยศสูงสุด</label>
                    <select value={form.eligible_rank_max}
                      onChange={e => setForm({ ...form, eligible_rank_max: e.target.value })}
                      className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B] bg-white">
                      <option value="">ไม่จำกัด</option>
                      {RANK_CHOICES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-sm font-medium text-[#4a4456] mb-1">ระยะเวลาครองยศขั้นต่ำ (ปี)</label>
                    <input type="number" min={0} placeholder="ไม่จำกัด" value={form.eligible_min_years_in_rank}
                      onChange={e => setForm({ ...form, eligible_min_years_in_rank: e.target.value })}
                      className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4a4456] mb-1">ประเภทบุคลากร</label>
                    <select value={form.eligible_personnel_type}
                      onChange={e => setForm({ ...form, eligible_personnel_type: e.target.value })}
                      className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B] bg-white">
                      <option value="">ทุกประเภท</option>
                      {PERSONNEL_TYPE_CHOICES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">คำอธิบายเพิ่มเติม (ไม่บังคับ)</label>
                  <input type="text" placeholder="เช่น ต้องผ่านหลักสูตรพื้นฐานมาก่อน" value={form.eligible_rank_class}
                    onChange={e => setForm({ ...form, eligible_rank_class: e.target.value })}
                    className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#4a4456] mb-1">โควตารวม</label>
                <input type="number" value={form.quota_total}
                  onChange={e => setForm({ ...form, quota_total: Number(e.target.value) })}
                  className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#e6e1ee] flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setShowModal(false)}>
                ยกเลิก
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
