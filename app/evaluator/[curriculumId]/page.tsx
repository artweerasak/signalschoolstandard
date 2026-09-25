/**
 * app/evaluator/[curriculumId]/page.tsx
 * จัดการแบบประเมิน + ดูผลสรุป + สถานะการประเมิน + จัดอันดับ ของหลักสูตรเดียว
 * (แยกหน้าจาก /evaluator ที่เป็นแค่รายการเลือกหลักสูตร — กันหน้ายาวเกินไป
 * เมื่อ 1 ปีมีหลายหลักสูตร)
 */
"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  api, EvaluationFormItem, EvaluationStatusDashboard, EvaluationResponsesSummary,
  EvaluatorCurriculumItem, CurriculumRanking,
} from "@/lib/api"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"
import StatusPill from "@/components/ui/StatusPill"

const RATING_LABELS: Record<number, string> = {
  5: "มากที่สุด", 4: "มาก", 3: "ปานกลาง", 2: "น้อย", 1: "น้อยที่สุด",
}

interface QuestionDraft {
  key: string
  label: string
  type: "rating" | "text"
}
interface FormBuilderState {
  level: "course" | "curriculum"
  curriculum_course_id: string
  title: string
  is_required: boolean
  questions: QuestionDraft[]
}
const EMPTY_FORM: FormBuilderState = {
  level: "curriculum", curriculum_course_id: "", title: "", is_required: true,
  questions: [{ key: "q1", label: "ความพึงพอใจโดยรวมต่อหลักสูตร", type: "rating" }],
}

export default function EvaluatorCurriculumPage() {
  const params = useParams()
  const curriculumId = Number(params.curriculumId)

  const [curriculumInfo, setCurriculumInfo] = useState<EvaluatorCurriculumItem | null>(null)
  const [forms, setForms] = useState<EvaluationFormItem[]>([])
  const [dashboard, setDashboard] = useState<EvaluationStatusDashboard | null>(null)
  const [ranking, setRanking] = useState<CurriculumRanking | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<FormBuilderState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")

  const [summaryFor, setSummaryFor] = useState<EvaluationFormItem | null>(null)
  const [summary, setSummary] = useState<EvaluationResponsesSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  const load = () => {
    setLoading(true)
    setError("")
    Promise.all([
      api.listEvaluationForms({ curriculum_id: curriculumId }),
      api.getEvaluationStatusDashboard(curriculumId),
      api.getCurriculumRanking(curriculumId),
      api.listEvaluatorCurricula(),
    ])
      .then(([formsRes, dashRes, rankRes, curriculaRes]) => {
        setForms(formsRes.results)
        setDashboard(dashRes)
        setRanking(rankRes)
        setCurriculumInfo(curriculaRes.results.find(c => c.id === curriculumId) ?? null)
      })
      .catch(() => setError("ไม่สามารถโหลดข้อมูลหลักสูตรนี้ได้"))
      .finally(() => setLoading(false))
  }

  useEffect(() => { if (curriculumId) load() }, [curriculumId])

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setFormError("")
    setShowModal(true)
  }

  const nextQuestionKey = () => `q${form.questions.length + 1}`

  const updateQuestion = (idx: number, patch: Partial<QuestionDraft>) => {
    const qs = [...form.questions]
    qs[idx] = { ...qs[idx], ...patch }
    setForm({ ...form, questions: qs })
  }

  const removeQuestion = (idx: number) => {
    setForm({ ...form, questions: form.questions.filter((_, i) => i !== idx) })
  }

  const addRatingQuestion = () => {
    setForm({ ...form, questions: [...form.questions, { key: nextQuestionKey(), label: "", type: "rating" }] })
  }

  const addSuggestionQuestion = () => {
    setForm({
      ...form,
      questions: [...form.questions, { key: nextQuestionKey(), label: "ข้อเสนอแนะเพิ่มเติม", type: "text" }],
    })
  }

  const handleSaveForm = async () => {
    if (!form.title.trim()) { setFormError("กรุณากรอกชื่อแบบประเมิน"); return }
    if (form.level === "course" && !form.curriculum_course_id) { setFormError("กรุณากรอกรหัสวิชา (curriculum_course_id)"); return }
    if (form.questions.length === 0) { setFormError("ต้องมีคำถามอย่างน้อย 1 ข้อ"); return }
    if (form.questions.some(q => !q.label.trim())) { setFormError("กรุณากรอกข้อความคำถามให้ครบทุกข้อ"); return }
    setSaving(true)
    setFormError("")
    try {
      await api.createEvaluationForm({
        curriculum_id: curriculumId, level: form.level, title: form.title, is_required: form.is_required,
        curriculum_course_id: form.level === "course" ? Number(form.curriculum_course_id) : undefined,
        schema: { questions: form.questions },
      })
      setShowModal(false)
      load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ")
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (f: EvaluationFormItem) => {
    try {
      await api.updateEvaluationForm(f.id, { is_active: !f.is_active })
      load()
    } catch {
      setError("อัปเดตไม่สำเร็จ")
    }
  }

  const openSummary = (f: EvaluationFormItem) => {
    setSummaryFor(f)
    setSummary(null)
    setSummaryLoading(true)
    api.getEvaluationFormResponsesSummary(f.id)
      .then(setSummary)
      .catch(() => setError("โหลดผลสรุปไม่สำเร็จ"))
      .finally(() => setSummaryLoading(false))
  }

  if (loading) return <div className="flex h-full items-center justify-center text-[#9a92a8]">กำลังโหลด...</div>

  return (
    <div className="p-6 space-y-6">
      <div>
        <Link href="/evaluator" className="text-sm text-[#6b6478] hover:text-[#4A1A6B]">← กลับรายการหลักสูตร</Link>
        <h1 className="text-2xl font-bold text-[#4A1A6B] mt-2">{curriculumInfo?.name ?? dashboard?.curriculum_name ?? "หลักสูตร"}</h1>
        {curriculumInfo && (
          <p className="text-sm text-[#6b6478] mt-1">
            รุ่น {curriculumInfo.batch_code} · ปีการศึกษา {curriculumInfo.academic_year}
            {curriculumInfo.organization_name && ` · ${curriculumInfo.organization_name}`}
          </p>
        )}
      </div>

      {error && (
        <div className="bg-[#fee2e2] border border-[#f3a0a0] text-[#b91c1c] px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      {dashboard && (
        <Card className="p-5">
          <p className="text-sm text-[#6b6478]">
            ประเมินครบแล้ว <span className="font-mono font-semibold text-[#4A1A6B]">{dashboard.results.filter(r => r.curriculum_evaluation_complete).length} / {dashboard.count}</span> คน
          </p>
        </Card>
      )}

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
                <th className="px-4 py-3">ผลสรุป</th>
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
                  <td className="px-4 py-3">
                    <button onClick={() => openSummary(f)} className="text-[#4A1A6B] hover:underline text-xs font-medium">
                      ดูผลสรุป →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {dashboard && (
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
      )}

      {ranking && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-[#f0ecf6]">
            <h2 className="font-semibold text-[#2D0F42]">จัดอันดับนักเรียน</h2>
            <p className="text-xs text-[#9a92a8] mt-0.5">เกรดเฉลี่ยถ่วงน้ำหนักตามหน่วยกิต — เท่ากันเรียงตามคะแนนรวม</p>
          </div>
          {ranking.results.length === 0 ? (
            <div className="py-12 text-center text-[#9a92a8] text-sm">ยังไม่มีวิชาไหนปิดคะแนนเลย</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e6e1ee] bg-[#f7f5fa] text-left text-xs text-[#6b6478] uppercase">
                  <th className="px-4 py-3">อันดับ</th>
                  <th className="px-4 py-3">ชื่อ-สกุล</th>
                  <th className="px-4 py-3">เกรดเฉลี่ย</th>
                  <th className="px-4 py-3">คะแนนรวม</th>
                  <th className="px-4 py-3">ความคืบหน้า</th>
                </tr>
              </thead>
              <tbody>
                {ranking.results.map(r => (
                  <tr key={r.student_id} className="border-b border-[#f0ecf6] hover:bg-[#f7f5fa]">
                    <td className="px-4 py-3 font-mono font-semibold text-[#4A1A6B]">{r.rank}</td>
                    <td className="px-4 py-3 font-medium">{r.rank_display} {r.full_name}</td>
                    <td className="px-4 py-3 font-mono">{r.weighted_average ?? "-"}</td>
                    <td className="px-4 py-3 font-mono text-[#6b6478]">{r.total_score}</td>
                    <td className="px-4 py-3">
                      {r.is_complete
                        ? <StatusPill tone="success">ครบทุกวิชา</StatusPill>
                        : <StatusPill tone="warning">{r.courses_graded}/{r.courses_total} วิชา</StatusPill>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* สร้างแบบประเมินใหม่ */}
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
                <div className="space-y-3">
                  {form.questions.map((q, i) => (
                    <div key={i} className="border border-[#e6e1ee] rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <select value={q.type} onChange={e => updateQuestion(i, { type: e.target.value as "rating" | "text" })}
                          className="border border-[#d9d2e6] rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]">
                          <option value="rating">มาตรวัด 5 ระดับ</option>
                          <option value="text">ข้อความอิสระ</option>
                        </select>
                        {form.questions.length > 1 && (
                          <button type="button" onClick={() => removeQuestion(i)}
                            className="ml-auto text-red-500 hover:underline text-xs">ลบ</button>
                        )}
                      </div>
                      <input type="text" placeholder={`คำถามข้อ ${i + 1}`} value={q.label}
                        onChange={e => updateQuestion(i, { label: e.target.value })}
                        className="w-full border border-[#d9d2e6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                      {q.type === "rating" && (
                        <p className="text-xs text-[#9a92a8]">แสดงเป็น 5 ระดับมาตรฐาน: มากที่สุด / มาก / ปานกลาง / น้อย / น้อยที่สุด</p>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 mt-2">
                  <button onClick={addRatingQuestion} className="text-[#4A1A6B] text-xs font-medium hover:underline">
                    + เพิ่มคำถามมาตรวัด
                  </button>
                  <button onClick={addSuggestionQuestion} className="text-[#4A1A6B] text-xs font-medium hover:underline">
                    + เพิ่มข้อเสนอแนะ
                  </button>
                </div>
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

      {/* ผลสรุปแบบประเมิน */}
      {summaryFor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-[#e6e1ee] flex items-center justify-between">
              <h3 className="font-bold text-[#2D0F42]">ผลสรุป: {summaryFor.title}</h3>
              <button onClick={() => setSummaryFor(null)} className="text-[#9a92a8] hover:text-[#6b6478]">✕</button>
            </div>
            <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
              {summaryLoading ? (
                <p className="text-sm text-[#9a92a8]">กำลังโหลด...</p>
              ) : summary ? (
                <>
                  <p className="text-sm text-[#6b6478]">ผู้ตอบทั้งหมด <span className="font-mono font-semibold text-[#4A1A6B]">{summary.answered_count}</span> คน</p>
                  {summary.questions.map(q => (
                    <div key={q.key} className="border-t border-[#f0ecf6] pt-4 first:border-0 first:pt-0">
                      <p className="text-sm font-medium text-[#2D0F42] mb-2">{q.label}</p>
                      {q.type === "rating" ? (
                        <>
                          <p className="text-2xl font-bold text-[#4A1A6B] mb-2">
                            {q.average ?? "-"} <span className="text-sm font-normal text-[#9a92a8]">/ 5</span>
                          </p>
                          <div className="space-y-1">
                            {[5, 4, 3, 2, 1].map(v => {
                              const count = q.distribution?.[String(v)] ?? 0
                              const pct = q.response_count > 0 ? Math.round((count / q.response_count) * 100) : 0
                              return (
                                <div key={v} className="flex items-center gap-2 text-xs">
                                  <span className="w-24 shrink-0 text-[#6b6478]">{v} · {RATING_LABELS[v]}</span>
                                  <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                                    <div className="h-2.5 bg-[#4A1A6B] rounded-full" style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="w-8 shrink-0 text-right text-[#9a92a8] font-mono">{count}</span>
                                </div>
                              )
                            })}
                          </div>
                        </>
                      ) : q.answers && q.answers.length > 0 ? (
                        <div className="space-y-1.5">
                          {q.answers.map((a, i) => (
                            <p key={i} className="text-sm bg-[#f7f5fa] rounded-lg px-3 py-2 text-[#4a4456]">{a}</p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-[#9a92a8]">ยังไม่มีคำตอบ</p>
                      )}
                    </div>
                  ))}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
