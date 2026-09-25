/**
 * app/evaluator/page.tsx
 * จัดการแบบประเมิน + ดู dashboard สถานะการประเมินของหลักสูตร
 */
"use client"

import { useEffect, useMemo, useState } from "react"
import { api, EvaluationFormItem, EvaluationStatusDashboard, EvaluatorCurriculumItem } from "@/lib/api"
import Card from "@/components/ui/Card"
import PageHeader from "@/components/ui/PageHeader"
import Button from "@/components/ui/Button"
import StatusPill from "@/components/ui/StatusPill"

const STATUS_LABELS: Record<string, string> = {
  submitted: "ส่งแล้ว", active: "กำลังดำเนินการ", closed: "ปิดรุ่น",
}
const STATUS_TONES: Record<string, "info" | "success" | "neutral"> = {
  submitted: "info", active: "success", closed: "neutral",
}

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
  const [curriculumId, setCurriculumId] = useState<number | null>(null)

  const [curricula, setCurricula] = useState<EvaluatorCurriculumItem[]>([])
  const [curriculaLoading, setCurriculaLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)

  const [forms, setForms] = useState<EvaluationFormItem[]>([])
  const [dashboard, setDashboard] = useState<EvaluationStatusDashboard | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<FormBuilderState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")

  useEffect(() => {
    api.listEvaluatorCurricula()
      .then(r => {
        setCurricula(r.results)
        if (r.results.length > 0) setSelectedYear(r.results[0].academic_year) // เรียงปีล่าสุดมาก่อนแล้วจาก backend
      })
      .catch(() => setError("โหลดรายการหลักสูตรไม่สำเร็จ"))
      .finally(() => setCurriculaLoading(false))
  }, [])

  const years = useMemo(
    () => Array.from(new Set(curricula.map(c => c.academic_year))).sort((a, b) => b - a),
    [curricula]
  )
  const curriculaForYear = useMemo(
    () => curricula.filter(c => c.academic_year === selectedYear),
    [curricula, selectedYear]
  )

  const load = (id: number) => {
    setLoading(true)
    setError("")
    Promise.all([
      api.listEvaluationForms({ curriculum_id: id }),
      api.getEvaluationStatusDashboard(id),
    ])
      .then(([formsRes, dashRes]) => { setForms(formsRes.results); setDashboard(dashRes) })
      .catch(() => setError("ไม่สามารถโหลดข้อมูลหลักสูตรนี้ได้"))
      .finally(() => setLoading(false))
  }

  const handleSelectCurriculum = (id: number) => {
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
      <PageHeader
        title="การประเมินผล"
        description="สร้างแบบประเมินรายวิชา/หลักสูตรรวม และติดตามสถานะการประเมินของกำลังพล"
      />

      {error && (
        <div className="bg-[#fee2e2] border border-[#f3a0a0] text-[#b91c1c] px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      {curriculaLoading ? (
        <p className="text-[#9a92a8] text-sm">กำลังโหลดรายการหลักสูตร...</p>
      ) : curricula.length === 0 ? (
        <Card className="p-6 text-center text-sm text-[#9a92a8]">ยังไม่มีหลักสูตรที่ส่งให้แผนกเตรียมพลแล้ว</Card>
      ) : (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-[#6b6478]">ปีการศึกษา</label>
            <select value={selectedYear ?? ""} onChange={e => setSelectedYear(Number(e.target.value))}
              className="border border-[#d9d2e6] rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {curriculaForYear.length === 0 ? (
              <p className="text-sm text-[#9a92a8] py-3">ไม่มีหลักสูตรของปีนี้</p>
            ) : (
              curriculaForYear.map(c => (
                <button key={c.id} onClick={() => handleSelectCurriculum(c.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between gap-2 transition-colors
                    ${curriculumId === c.id ? "bg-[#4A1A6B] text-white" : "hover:bg-[#f7f5fa] text-[#2D0F42]"}`}>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{c.name} <span className={curriculumId === c.id ? "text-purple-200" : "text-[#9a92a8]"}>รุ่น {c.batch_code}</span></p>
                    {c.organization_name && (
                      <p className={`text-xs truncate ${curriculumId === c.id ? "text-purple-200" : "text-[#9a92a8]"}`}>{c.organization_name}</p>
                    )}
                  </div>
                  <StatusPill tone={STATUS_TONES[c.status] ?? "neutral"}>{STATUS_LABELS[c.status] ?? c.status}</StatusPill>
                </button>
              ))
            )}
          </div>
        </Card>
      )}

      {loading && <div className="py-8 text-center text-[#9a92a8]">กำลังโหลด...</div>}

      {dashboard && !loading && (
        <>
          <Card className="p-5">
            <p className="font-medium text-[#2D0F42]">{dashboard.curriculum_name}</p>
            <p className="text-sm text-[#6b6478] mt-1">
              ประเมินครบแล้ว <span className="font-mono">{dashboard.results.filter(r => r.curriculum_evaluation_complete).length} / {dashboard.count}</span> คน
            </p>
          </Card>

          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-[#2D0F42]">แบบประเมิน ({forms.length})</h2>
            <Button onClick={openCreate}>+ สร้างแบบประเมินใหม่</Button>
          </div>

          <Card className="overflow-hidden">
            {forms.length === 0 ? (
              <div className="py-12 text-center text-[#9a92a8] text-sm">ยังไม่มีแบบประเมินสำหรับหลักสูตรนี้</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e6e1ee] bg-[#f7f5fa] text-left text-xs text-[#6b6478] uppercase">
                    <th className="px-4 py-3">ชื่อแบบประเมิน</th>
                    <th className="px-4 py-3">ระดับ</th>
                    <th className="px-4 py-3">บังคับ</th>
                    <th className="px-4 py-3">ตอบแล้ว</th>
                    <th className="px-4 py-3">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {forms.map(f => (
                    <tr key={f.id} className="border-b border-[#f0ecf6] hover:bg-[#f7f5fa]">
                      <td className="px-4 py-3 font-medium">{f.title}</td>
                      <td className="px-4 py-3 text-[#6b6478]">{f.level === "curriculum" ? "หลักสูตรรวม" : "รายวิชา"}</td>
                      <td className="px-4 py-3 text-[#6b6478]">{f.is_required ? "บังคับ" : "ไม่บังคับ"}</td>
                      <td className="px-4 py-3 text-[#6b6478] font-mono">{f.response_count}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleToggleActive(f)} className="cursor-pointer">
                          <StatusPill tone={f.is_active ? "success" : "neutral"}>
                            {f.is_active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                          </StatusPill>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="p-4 border-b border-[#f0ecf6]"><h2 className="font-semibold text-[#2D0F42]">สถานะรายบุคคล (ระดับหลักสูตรรวม)</h2></div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e6e1ee] bg-[#f7f5fa] text-left text-xs text-[#6b6478] uppercase">
                  <th className="px-4 py-3">ชื่อ-สกุล</th>
                  <th className="px-4 py-3">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.results.map(r => (
                  <tr key={r.student_id} className="border-b border-[#f0ecf6] hover:bg-[#f7f5fa]">
                    <td className="px-4 py-3">{r.full_name}</td>
                    <td className="px-4 py-3">
                      <StatusPill tone={r.curriculum_evaluation_complete ? "success" : "warning"}>
                        {r.curriculum_evaluation_complete ? "ประเมินแล้ว" : "ยังไม่ประเมิน"}
                      </StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-[#e6e1ee] flex items-center justify-between">
              <h3 className="font-bold text-[#2D0F42]">สร้างแบบประเมินใหม่</h3>
              <button onClick={() => setShowModal(false)} className="text-[#9a92a8] hover:text-[#6b6478]">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {formError && (
                <div className="bg-[#fee2e2] border border-[#f3a0a0] text-[#b91c1c] px-3 py-2 rounded-xl text-sm">{formError}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-[#4a4456] mb-1">ระดับ</label>
                <select value={form.level} onChange={e => setForm({ ...form, level: e.target.value as "course" | "curriculum" })}
                  className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]">
                  <option value="curriculum">หลักสูตรรวม</option>
                  <option value="course">รายวิชา</option>
                </select>
              </div>
              {form.level === "course" && (
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">รหัสวิชา (curriculum_course_id)</label>
                  <input type="text" value={form.curriculum_course_id}
                    onChange={e => setForm({ ...form, curriculum_course_id: e.target.value })}
                    className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-[#4a4456] mb-1">ชื่อแบบประเมิน</label>
                <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#4a4456] mb-2">คำถาม</label>
                <div className="space-y-2">
                  {form.questions.map((q, i) => (
                    <input key={i} type="text" placeholder={`คำถามข้อ ${i + 1}`} value={q.label}
                      onChange={e => updateQuestion(i, "label", e.target.value)}
                      className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
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
                <label htmlFor="is_required" className="text-sm text-[#4a4456]">บังคับประเมิน (ใช้เป็นเงื่อนไขปิดกั้นการเห็นคะแนน/ใบประกาศ)</label>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#e6e1ee] flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setShowModal(false)}>ยกเลิก</Button>
              <Button onClick={handleSaveForm} disabled={saving}>
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
