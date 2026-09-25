/**
 * app/prep-school/page.tsx
 * รายการหลักสูตรประจำปี/รุ่น ของหน่วย — สร้าง/แก้ไข/ส่งต่อแผนกเตรียมพล
 */
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { api, CurriculumSummary } from "@/lib/api"

const STATUS_LABELS: Record<string, string> = {
  draft: "ร่าง",
  submitted: "ส่งให้แผนกเตรียมพลแล้ว",
  active: "ใช้งาน",
  closed: "ปิดรุ่น",
}
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  submitted: "bg-yellow-100 text-yellow-700",
  active: "bg-emerald-100 text-emerald-700",
  closed: "bg-red-100 text-red-600",
}

interface FormData {
  name: string
  batch_code: string
  academic_year: number
  eligible_rank_class: string
  quota_total: number
}
const EMPTY_FORM: FormData = {
  name: "", batch_code: "", academic_year: new Date().getFullYear() + 543,
  eligible_rank_class: "", quota_total: 0,
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
    setSaving(true)
    setFormError("")
    try {
      await api.createCurriculum(form)
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#4A1A6B]">หลักสูตรของหน่วย</h1>
          <p className="text-sm text-gray-500 mt-1">สร้างกรอบหลักสูตรประจำปี/รุ่น แล้วส่งต่อแผนกเตรียมพลเพื่อบรรจุกำลังพล</p>
        </div>
        <button
          onClick={openAdd}
          className="bg-[#4A1A6B] hover:bg-[#2D0F42] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + สร้างหลักสูตรใหม่
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400">กำลังโหลด...</div>
        ) : curricula.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <p className="text-lg mb-2">ยังไม่มีหลักสูตร</p>
            <p className="text-sm">คลิก &ldquo;สร้างหลักสูตรใหม่&rdquo; เพื่อเริ่มต้น</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500 uppercase">
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
                <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/prep-school/curricula/${c.id}`} className="text-[#4A1A6B] font-medium hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.batch_code}</td>
                  <td className="px-4 py-3 text-gray-600">{c.academic_year}</td>
                  <td className="px-4 py-3 text-gray-600">{c.course_count}</td>
                  <td className="px-4 py-3 text-gray-600">{c.quota_total}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-3 py-1 rounded-full ${STATUS_COLORS[c.status]}`}>
                      {STATUS_LABELS[c.status] || c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-bold text-[#2D0F42]">สร้างหลักสูตรใหม่</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{formError}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อหลักสูตร</label>
                <input type="text" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">รุ่นที่</label>
                  <input type="text" value={form.batch_code}
                    onChange={e => setForm({ ...form, batch_code: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ปีการศึกษา (พ.ศ.)</label>
                  <input type="number" value={form.academic_year}
                    onChange={e => setForm({ ...form, academic_year: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ช่วงชั้นยศที่มีสิทธิ์ (ไม่บังคับ)</label>
                <input type="text" placeholder="เช่น นายทหารประทวน" value={form.eligible_rank_class}
                  onChange={e => setForm({ ...form, eligible_rank_class: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">โควตารวม</label>
                <input type="number" value={form.quota_total}
                  onChange={e => setForm({ ...form, quota_total: Number(e.target.value) })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex gap-3 justify-end">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                ยกเลิก
              </button>
              <button onClick={handleSave} disabled={saving}
                className="bg-[#4A1A6B] hover:bg-[#2D0F42] text-white text-sm font-medium px-6 py-2 rounded-lg disabled:opacity-50">
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
