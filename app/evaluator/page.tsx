/**
 * app/evaluator/page.tsx
 * จัดการแบบประเมิน + ดู dashboard สถานะการประเมินของหลักสูตร
 */
"use client"

import { useState } from "react"
import { api, EvaluationFormItem, EvaluationStatusDashboard } from "@/lib/api"

interface FormBuilderState {
  level: "course" | "curriculum"
  curriculum_course_id: string
  title: string
  is_required: boolean
  questions: { key: string; label: string }[]
}
const EMPTY_FORM: FormBuilderState = {
  level: "curriculum", curriculum_course_id: "", title: "", is_required: true,
  questions: [{ key: "q1", label: "" }],
}

export default function EvaluatorPage() {
  const [curriculumIdInput, setCurriculumIdInput] = useState("")
  const [curriculumId, setCurriculumId] = useState<number | null>(null)

  const [forms, setForms] = useState<EvaluationFormItem[]>([])
  const [dashboard, setDashboard] = useState<EvaluationStatusDashboard | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<FormBuilderState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")

  const load = (id: number) => {
    setLoading(true)
    setError("")
    Promise.all([
      api.listEvaluationForms({ curriculum_id: id }),
      api.getEvaluationStatusDashboard(id),
    ])
      .then(([formsRes, dashRes]) => { setForms(formsRes.results); setDashboard(dashRes) })
      .catch(() => setError("ไม่พบหลักสูตรนี้ หรือไม่สามารถโหลดข้อมูลได้"))
      .finally(() => setLoading(false))
  }

  const handleSearch = () => {
    const id = Number(curriculumIdInput)
    if (!id) { setError("กรุณากรอกรหัสหลักสูตร (curriculum_id)"); return }
    setCurriculumId(id)
    load(id)
  }

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setFormError("")
    setShowModal(true)
  }

  const updateQuestion = (idx: number, field: "key" | "label", value: string) => {
    const qs = [...form.questions]
    qs[idx] = { ...qs[idx], [field]: value }
    setForm({ ...form, questions: qs })
  }

  const handleSaveForm = async () => {
    if (!curriculumId) return
    if (!form.title.trim()) { setFormError("กรุณากรอกชื่อแบบประเมิน"); return }
    if (form.level === "course" && !form.curriculum_course_id) { setFormError("กรุณากรอกรหัสวิชา (curriculum_course_id)"); return }
    setSaving(true)
    setFormError("")
    try {
      await api.createEvaluationForm({
        curriculum_id: curriculumId, level: form.level, title: form.title, is_required: form.is_required,
        curriculum_course_id: form.level === "course" ? Number(form.curriculum_course_id) : undefined,
        schema: { questions: form.questions.filter(q => q.label.trim()) },
      })
      setShowModal(false)
      load(curriculumId)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ")
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (f: EvaluationFormItem) => {
    try {
      await api.updateEvaluationForm(f.id, { is_active: !f.is_active })
      if (curriculumId) load(curriculumId)
    } catch {
      setError("อัปเดตไม่สำเร็จ")
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#4A1A6B]">การประเมินผล</h1>
        <p className="text-sm text-gray-500 mt-1">สร้างแบบประเมินรายวิชา/หลักสูตรรวม และติดตามสถานะการประเมินของกำลังพล</p>
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-4 flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">รหัสหลักสูตร (curriculum_id)</label>
          <input type="text" value={curriculumIdInput} onChange={e => setCurriculumIdInput(e.target.value)}
            placeholder="เช่น 5"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
        </div>
        <button onClick={handleSearch}
          className="bg-[#4A1A6B] hover:bg-[#2D0F42] text-white text-sm font-medium px-5 py-2 rounded-lg">
          ค้นหา
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {loading && <div className="py-8 text-center text-gray-400">กำลังโหลด...</div>}

      {dashboard && !loading && (
        <>
          <div className="bg-white rounded-xl border shadow-sm p-5">
            <p className="font-medium text-[#2D0F42]">{dashboard.curriculum_name}</p>
            <p className="text-sm text-gray-500 mt-1">
              ประเมินครบแล้ว {dashboard.results.filter(r => r.curriculum_evaluation_complete).length} / {dashboard.count} คน
            </p>
          </div>

          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-[#2D0F42]">แบบประเมิน ({forms.length})</h2>
            <button onClick={openCreate}
              className="bg-[#4A1A6B] hover:bg-[#2D0F42] text-white text-sm font-medium px-4 py-2 rounded-lg">
              + สร้างแบบประเมินใหม่
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {forms.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">ยังไม่มีแบบประเมินสำหรับหลักสูตรนี้</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500 uppercase">
                    <th className="px-4 py-3">ชื่อแบบประเมิน</th>
                    <th className="px-4 py-3">ระดับ</th>
                    <th className="px-4 py-3">บังคับ</th>
                    <th className="px-4 py-3">ตอบแล้ว</th>
                    <th className="px-4 py-3">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {forms.map(f => (
                    <tr key={f.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{f.title}</td>
                      <td className="px-4 py-3 text-gray-600">{f.level === "curriculum" ? "หลักสูตรรวม" : "รายวิชา"}</td>
                      <td className="px-4 py-3 text-gray-600">{f.is_required ? "บังคับ" : "ไม่บังคับ"}</td>
                      <td className="px-4 py-3 text-gray-600">{f.response_count}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleToggleActive(f)}
                          className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${
                            f.is_active ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          }`}>
                          {f.is_active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b"><h2 className="font-semibold text-[#2D0F42]">สถานะรายบุคคล (ระดับหลักสูตรรวม)</h2></div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500 uppercase">
                  <th className="px-4 py-3">ชื่อ-สกุล</th>
                  <th className="px-4 py-3">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.results.map(r => (
                  <tr key={r.student_id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">{r.full_name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        r.curriculum_evaluation_complete ? "bg-emerald-100 text-emerald-700" : "bg-yellow-100 text-yellow-700"
                      }`}>
                        {r.curriculum_evaluation_complete ? "ประเมินแล้ว" : "ยังไม่ประเมิน"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-bold text-[#2D0F42]">สร้างแบบประเมินใหม่</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{formError}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ระดับ</label>
                <select value={form.level} onChange={e => setForm({ ...form, level: e.target.value as "course" | "curriculum" })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]">
                  <option value="curriculum">หลักสูตรรวม</option>
                  <option value="course">รายวิชา</option>
                </select>
              </div>
              {form.level === "course" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">รหัสวิชา (curriculum_course_id)</label>
                  <input type="text" value={form.curriculum_course_id}
                    onChange={e => setForm({ ...form, curriculum_course_id: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อแบบประเมิน</label>
                <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">คำถาม</label>
                <div className="space-y-2">
                  {form.questions.map((q, i) => (
                    <input key={i} type="text" placeholder={`คำถามข้อ ${i + 1}`} value={q.label}
                      onChange={e => updateQuestion(i, "label", e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                  ))}
                </div>
                <button onClick={() => setForm({ ...form, questions: [...form.questions, { key: `q${form.questions.length + 1}`, label: "" }] })}
                  className="text-[#4A1A6B] text-xs font-medium mt-2 hover:underline">
                  + เพิ่มคำถาม
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_required" checked={form.is_required}
                  onChange={e => setForm({ ...form, is_required: e.target.checked })}
                  className="w-4 h-4 accent-[#4A1A6B]" />
                <label htmlFor="is_required" className="text-sm text-gray-700">บังคับประเมิน (ใช้เป็นเงื่อนไขปิดกั้นการเห็นคะแนน/ใบประกาศ)</label>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex gap-3 justify-end">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">ยกเลิก</button>
              <button onClick={handleSaveForm} disabled={saving}
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
