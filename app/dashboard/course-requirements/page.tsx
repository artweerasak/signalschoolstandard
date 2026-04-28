/**
 * app/dashboard/course-requirements/page.tsx
 * กำหนดหลักสูตรที่แต่ละระดับชั้นต้องผ่าน
 */
"use client"

import { useEffect, useState } from "react"
import { api, CourseRequirement } from "@/lib/api"

const RANK_CLASS_OPTIONS = [
  { value: "nco", label: "นายทหารประทวน" },
  { value: "officer", label: "นายทหารสัญญาบัตร" },
  { value: "pvt", label: "พลทหาร" },
  { value: "all", label: "ทุกระดับ" },
]

const RANK_CLASS_LABELS: Record<string, string> = {
  nco: "นายทหารประทวน",
  officer: "นายทหารสัญญาบัตร",
  pvt: "พลทหาร",
  all: "ทุกระดับ",
}

interface FormData {
  rank_class: string
  course_id: string
  course_name: string
  is_active: boolean
}

const EMPTY_FORM: FormData = { rank_class: "nco", course_id: "", course_name: "", is_active: true }

export default function CourseRequirementsPage() {
  const [requirements, setRequirements] = useState<CourseRequirement[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<CourseRequirement | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [formError, setFormError] = useState("")

  const load = () => {
    setLoading(true)
    api.courseRequirements()
      .then((r) => setRequirements(r.results))
      .catch(() => setError("ไม่สามารถโหลดข้อมูลได้"))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openAdd = () => {
    setEditItem(null)
    setForm(EMPTY_FORM)
    setFormError("")
    setShowModal(true)
  }

  const openEdit = (item: CourseRequirement) => {
    setEditItem(item)
    setForm({
      rank_class: item.rank_class,
      course_id: item.course_id,
      course_name: item.course_name,
      is_active: item.is_active,
    })
    setFormError("")
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.course_id.trim()) { setFormError("กรุณากรอก Course ID"); return }
    if (!form.course_name.trim()) { setFormError("กรุณากรอกชื่อหลักสูตร"); return }
    setSaving(true)
    setFormError("")
    try {
      if (editItem) {
        await api.updateCourseRequirement(editItem.id, form)
      } else {
        await api.createCourseRequirement(form)
      }
      setShowModal(false)
      load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm("ยืนยันการลบ?")) return
    try {
      await api.deleteCourseRequirement(id)
      load()
    } catch {
      setError("ไม่สามารถลบได้")
    }
  }

  const handleToggle = async (item: CourseRequirement) => {
    try {
      await api.updateCourseRequirement(item.id, { is_active: !item.is_active })
      load()
    } catch {
      setError("ไม่สามารถอัปเดตได้")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#2D0F42]">กำหนดหลักสูตรตามระดับชั้น</h2>
          <p className="text-sm text-gray-500 mt-1">กำหนดว่าระดับชั้นใดต้องผ่านหลักสูตรอะไรบ้าง</p>
        </div>
        <button
          onClick={openAdd}
          className="bg-[#4A1A6B] hover:bg-[#2D0F42] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + เพิ่มหลักสูตร
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400">กำลังโหลด...</div>
        ) : requirements.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <p className="text-lg mb-2">ยังไม่มีการกำหนดหลักสูตร</p>
            <p className="text-sm">คลิก &ldquo;เพิ่มหลักสูตร&rdquo; เพื่อเริ่มกำหนดมาตรฐาน</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500 uppercase">
                <th className="px-4 py-3">ระดับชั้น</th>
                <th className="px-4 py-3">Course ID</th>
                <th className="px-4 py-3">ชื่อหลักสูตร</th>
                <th className="px-4 py-3">สถานะ</th>
                <th className="px-4 py-3">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {requirements.map((item) => (
                <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="bg-purple-100 text-[#4A1A6B] text-xs font-medium px-2 py-1 rounded-full">
                      {RANK_CLASS_LABELS[item.rank_class] || item.rank_class_display || item.rank_class}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{item.course_id}</td>
                  <td className="px-4 py-3 text-gray-800">{item.course_name}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(item)}
                      className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${
                        item.is_active
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      {item.is_active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(item)}
                        className="text-[#4A1A6B] hover:underline text-xs font-medium"
                      >
                        แก้ไข
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-red-500 hover:underline text-xs font-medium"
                      >
                        ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-bold text-[#2D0F42]">{editItem ? "แก้ไขหลักสูตร" : "เพิ่มหลักสูตรใหม่"}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{formError}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ระดับชั้น</label>
                <select
                  value={form.rank_class}
                  onChange={(e) => setForm({ ...form, rank_class: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]"
                >
                  {RANK_CLASS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Course ID</label>
                <input
                  type="text"
                  placeholder="เช่น course-v1:Signal+SIG101+2024"
                  value={form.course_id}
                  onChange={(e) => setForm({ ...form, course_id: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อหลักสูตร</label>
                <input
                  type="text"
                  placeholder="ชื่อหลักสูตรที่ต้องผ่าน"
                  value={form.course_name}
                  onChange={(e) => setForm({ ...form, course_name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="w-4 h-4 accent-[#4A1A6B]"
                />
                <label htmlFor="is_active" className="text-sm text-gray-700">เปิดใช้งาน</label>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex gap-3 justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-[#4A1A6B] hover:bg-[#2D0F42] text-white text-sm font-medium px-6 py-2 rounded-lg disabled:opacity-50"
              >
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
