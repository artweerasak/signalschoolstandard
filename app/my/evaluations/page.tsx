/**
 * app/my/evaluations/page.tsx
 * แบบประเมินที่ต้องทำก่อนเห็นคะแนน/ใบประกาศ — ทุก role เข้าถึงได้ (เป็น
 * "student" ได้เสมอ)
 */
"use client"

import { useEffect, useState } from "react"
import { api, PendingEvaluationItem } from "@/lib/api"

const RATING_LABELS: Record<number, string> = {
  5: "มากที่สุด", 4: "มาก", 3: "ปานกลาง", 2: "น้อย", 1: "น้อยที่สุด",
}

export default function MyEvaluationsPage() {
  const [pending, setPending] = useState<PendingEvaluationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [activeForm, setActiveForm] = useState<PendingEvaluationItem | null>(null)
  const [answers, setAnswers] = useState<Record<string, string | number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")

  const load = () => {
    setLoading(true)
    api.getPendingEvaluations()
      .then(r => setPending(r.results))
      .catch(() => setError("ไม่สามารถโหลดข้อมูลได้"))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openForm = (item: PendingEvaluationItem) => {
    setActiveForm(item)
    setAnswers({})
    setSubmitError("")
  }

  const handleSubmit = async () => {
    if (!activeForm) return
    const questions = activeForm.schema.questions || []
    const missingRating = questions.find(q => (q.type ?? "text") === "rating" && !answers[q.key])
    if (missingRating) { setSubmitError(`กรุณาให้คะแนน "${missingRating.label}"`); return }
    setSubmitting(true)
    setSubmitError("")
    try {
      await api.submitEvaluation(activeForm.form_id, answers)
      setActiveForm(null)
      load()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "ส่งไม่สำเร็จ")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#4A1A6B]">แบบประเมินที่ต้องทำ</h1>
        <p className="text-sm text-[#6b6478] mt-1">ต้องทำแบบประเมินที่บังคับให้ครบก่อน จึงจะเห็นคะแนน/ดาวน์โหลดใบประกาศของหลักสูตรนั้นได้</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-[#f0ecf6] overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[#9a92a8]">กำลังโหลด...</div>
        ) : pending.length === 0 ? (
          <div className="py-16 text-center text-[#9a92a8]">🎉 ไม่มีแบบประเมินค้างอยู่</div>
        ) : (
          <div className="divide-y">
            {pending.map(item => (
              <div key={item.form_id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-xs text-[#6b6478] mt-0.5">
                    {item.curriculum_name}{item.curriculum_course_name && ` — ${item.curriculum_course_name}`}
                  </p>
                </div>
                <button onClick={() => openForm(item)}
                  className="bg-[#4A1A6B] hover:bg-[#2D0F42] text-white text-sm font-medium px-4 py-2 rounded-lg">
                  ทำแบบประเมิน
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {activeForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-[#e6e1ee]">
              <h3 className="font-bold text-[#2D0F42]">{activeForm.title}</h3>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
              {submitError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{submitError}</div>
              )}
              {(activeForm.schema.questions || []).map(q => (
                <div key={q.key}>
                  <label className="block text-sm font-medium text-[#4a4456] mb-2">{q.label}</label>
                  {(q.type ?? "text") === "rating" ? (
                    <div className="grid grid-cols-5 gap-1.5">
                      {[1, 2, 3, 4, 5].map(v => (
                        <button key={v} type="button" onClick={() => setAnswers({ ...answers, [q.key]: v })}
                          className={`flex flex-col items-center gap-1 py-2.5 rounded-lg border text-xs transition-colors
                            ${answers[q.key] === v
                              ? "bg-[#4A1A6B] border-[#4A1A6B] text-white font-semibold"
                              : "border-gray-300 text-[#6b6478] hover:border-[#4A1A6B] hover:bg-purple-50"}`}>
                          <span className="text-base font-bold leading-none">{v}</span>
                          <span className="leading-tight text-center">{RATING_LABELS[v]}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <textarea value={(answers[q.key] as string) || ""} onChange={e => setAnswers({ ...answers, [q.key]: e.target.value })}
                      rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                  )}
                </div>
              ))}
              {(!activeForm.schema.questions || activeForm.schema.questions.length === 0) && (
                <p className="text-sm text-[#9a92a8]">แบบประเมินนี้ไม่มีคำถาม กดยืนยันเพื่อบันทึกว่าได้ประเมินแล้ว</p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[#e6e1ee] flex gap-3 justify-end">
              <button onClick={() => setActiveForm(null)} className="px-4 py-2 text-sm text-[#6b6478] hover:text-[#2D0F42]">ยกเลิก</button>
              <button onClick={handleSubmit} disabled={submitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-6 py-2 rounded-lg disabled:opacity-50">
                {submitting ? "กำลังส่ง..." : "ส่งแบบประเมิน"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
