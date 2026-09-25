/**
 * app/instructor/my-courses/[id]/page.tsx
 * รายชื่อนักเรียน + กรอกคะแนน manual + คำนวณเกรดสรุป + จัดการผู้ช่วยสอน
 */
"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { api, RosterRow, CoInstructorRow } from "@/lib/api"

type Tab = "roster" | "co-instructors"

interface GradeForm {
  student_id: number | null
  component_name: string
  score: number
  max_score: number
  weight: number
  notes: string
}
const EMPTY_GRADE_FORM: GradeForm = { student_id: null, component_name: "", score: 0, max_score: 100, weight: 100, notes: "" }

export default function CurriculumCourseDetailPage() {
  const params = useParams()
  const curriculumCourseId = Number(params.id)

  const [tab, setTab] = useState<Tab>("roster")
  const [roster, setRoster] = useState<RosterRow[]>([])
  const [loadingRoster, setLoadingRoster] = useState(true)
  const [coInstructors, setCoInstructors] = useState<CoInstructorRow[]>([])
  const [loadingCoInstructors, setLoadingCoInstructors] = useState(false)
  const [coInstructorsLoaded, setCoInstructorsLoaded] = useState(false)
  const [error, setError] = useState("")

  const [showGradeModal, setShowGradeModal] = useState(false)
  const [gradeForm, setGradeForm] = useState<GradeForm>(EMPTY_GRADE_FORM)
  const [savingGrade, setSavingGrade] = useState(false)
  const [gradeFormError, setGradeFormError] = useState("")

  const [newCoInstructorId, setNewCoInstructorId] = useState("")
  const [addingCoInstructor, setAddingCoInstructor] = useState(false)
  const [finalizing, setFinalizing] = useState(false)

  const loadRoster = () => {
    setLoadingRoster(true)
    api.getCurriculumCourseRoster(curriculumCourseId)
      .then(r => setRoster(r.results))
      .catch(() => setError("ไม่สามารถโหลดรายชื่อนักเรียนได้"))
      .finally(() => setLoadingRoster(false))
  }

  const loadCoInstructors = () => {
    setLoadingCoInstructors(true)
    api.getCoInstructors(curriculumCourseId)
      .then(r => { setCoInstructors(r.results); setCoInstructorsLoaded(true) })
      .catch(() => setError("ไม่สามารถโหลดรายชื่อผู้ช่วยสอนได้"))
      .finally(() => setLoadingCoInstructors(false))
  }

  useEffect(() => { if (curriculumCourseId) loadRoster() }, [curriculumCourseId])

  const handleTabChange = (t: Tab) => {
    setTab(t)
    if (t === "co-instructors" && !coInstructorsLoaded) loadCoInstructors()
  }

  const openGradeModal = (studentId: number) => {
    setGradeForm({ ...EMPTY_GRADE_FORM, student_id: studentId })
    setGradeFormError("")
    setShowGradeModal(true)
  }

  const handleSaveGrade = async () => {
    if (!gradeForm.student_id) return
    if (!gradeForm.component_name.trim()) { setGradeFormError("กรุณากรอกชื่อรายการคะแนน"); return }
    setSavingGrade(true)
    setGradeFormError("")
    try {
      await api.addManualGrade(curriculumCourseId, {
        student_id: gradeForm.student_id, component_name: gradeForm.component_name,
        score: gradeForm.score, max_score: gradeForm.max_score, weight: gradeForm.weight, notes: gradeForm.notes,
      })
      setShowGradeModal(false)
      loadRoster()
    } catch (err) {
      setGradeFormError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ")
    } finally {
      setSavingGrade(false)
    }
  }

  const handleFinalize = async () => {
    if (!confirm("คำนวณเกรดสรุปของนักเรียนทุกคนในวิชานี้ใหม่ (ผสมคะแนนอัตโนมัติ + คะแนนที่กรอกเอง)?")) return
    setFinalizing(true)
    try {
      const r = await api.finalizeCurriculumCourse(curriculumCourseId)
      alert(`คำนวณเกรดสรุปแล้ว ${r.finalized_count} คน`)
      loadRoster()
    } catch (err) {
      setError(err instanceof Error ? err.message : "คำนวณไม่สำเร็จ")
    } finally {
      setFinalizing(false)
    }
  }

  const handleAddCoInstructor = async () => {
    const userId = Number(newCoInstructorId)
    if (!userId) { setError("กรุณากรอกรหัสผู้ใช้ (user_id) ให้ถูกต้อง"); return }
    setAddingCoInstructor(true)
    setError("")
    try {
      await api.addCoInstructor(curriculumCourseId, userId)
      setNewCoInstructorId("")
      loadCoInstructors()
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่มไม่สำเร็จ")
    } finally {
      setAddingCoInstructor(false)
    }
  }

  const handleRemoveCoInstructor = async (userId: number) => {
    if (!confirm("ยืนยันลบผู้ช่วยสอนคนนี้?")) return
    try {
      await api.removeCoInstructor(curriculumCourseId, userId)
      loadCoInstructors()
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ")
    }
  }

  return (
    <div>
      <nav className="text-sm text-[#6b6478] mb-4 flex items-center gap-2">
        <Link href="/instructor/my-courses" className="hover:text-[#4A1A6B]">คะแนน/วิชาในหลักสูตร</Link>
        <span>›</span>
        <span className="text-[#4a4456]">รายละเอียดวิชา</span>
      </nav>

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-[#4A1A6B]">รายชื่อนักเรียนและคะแนน</h2>
        <button onClick={handleFinalize} disabled={finalizing}
          className="bg-[#4A1A6B] hover:bg-[#2D0F42] text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
          {finalizing ? "กำลังคำนวณ..." : "🧮 คำนวณเกรดสรุปทั้งวิชา"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>
      )}

      <div className="flex gap-1 bg-[#f0ecf6] rounded-lg p-1 mb-6 w-fit">
        {[
          { key: "roster" as Tab, label: "👥 รายชื่อ/คะแนน" },
          { key: "co-instructors" as Tab, label: "🧑‍🏫 ผู้ช่วยสอน" },
        ].map(t => (
          <button key={t.key} onClick={() => handleTabChange(t.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.key ? "bg-white text-[#4A1A6B] shadow-sm" : "text-[#6b6478] hover:text-[#4a4456]"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "roster" && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {loadingRoster ? (
            <div className="p-12 text-center text-[#9a92a8]">กำลังโหลด...</div>
          ) : roster.length === 0 ? (
            <div className="p-12 text-center text-[#9a92a8]">ยังไม่มีนักเรียนในวิชานี้</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[#f5f3f7] text-[#4A1A6B]">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">ชื่อ-นามสกุล</th>
                  <th className="px-4 py-3 text-left font-semibold">คะแนนกรอกเอง</th>
                  <th className="px-4 py-3 text-left font-semibold">เกรดสรุป</th>
                  <th className="px-4 py-3 text-left font-semibold">ผล</th>
                  <th className="px-4 py-3 text-left font-semibold">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {roster.map(r => (
                  <tr key={r.student_id} className="hover:bg-[#f7f5fa]">
                    <td className="px-4 py-3 font-medium">{r.full_name}</td>
                    <td className="px-4 py-3 text-[#6b6478]">{r.manual_grade_count} รายการ</td>
                    <td className="px-4 py-3 text-[#6b6478]">{r.final_score ?? "-"}</td>
                    <td className="px-4 py-3">
                      {r.passed === null ? (
                        <span className="text-[#9a92a8] text-xs">ยังไม่ตัดสิน</span>
                      ) : (
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                          r.passed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                        }`}>
                          {r.passed ? "ผ่าน" : "ไม่ผ่าน"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => openGradeModal(r.student_id)} className="text-[#4A1A6B] hover:underline text-xs font-medium">
                        + กรอกคะแนน
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "co-instructors" && (
        <div className="bg-white rounded-xl shadow-sm border p-5 space-y-4">
          <div className="flex gap-2">
            <input type="text" placeholder="รหัสผู้ใช้ (user_id) ของผู้ช่วยสอน" value={newCoInstructorId}
              onChange={e => setNewCoInstructorId(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
            <button onClick={handleAddCoInstructor} disabled={addingCoInstructor}
              className="bg-[#4A1A6B] hover:bg-[#2D0F42] text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
              เพิ่ม
            </button>
          </div>

          {loadingCoInstructors ? (
            <div className="py-8 text-center text-[#9a92a8] text-sm">กำลังโหลด...</div>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {coInstructors.map(ci => (
                  <tr key={ci.user_id}>
                    <td className="px-2 py-2 font-mono text-xs text-[#6b6478]">{ci.user_id}</td>
                    <td className="px-2 py-2">{ci.username}</td>
                    <td className="px-2 py-2">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        ci.is_owner ? "bg-purple-100 text-[#4A1A6B]" : "bg-[#f0ecf6] text-[#6b6478]"
                      }`}>
                        {ci.is_owner ? "เจ้าของวิชา" : "ผู้ช่วยสอน"}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right">
                      {!ci.is_owner && (
                        <button onClick={() => handleRemoveCoInstructor(ci.user_id)} className="text-red-500 hover:underline text-xs">
                          ลบ
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showGradeModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-[#e6e1ee] flex items-center justify-between">
              <h3 className="font-bold text-[#2D0F42]">กรอกคะแนน</h3>
              <button onClick={() => setShowGradeModal(false)} className="text-[#9a92a8] hover:text-[#6b6478]">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {gradeFormError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{gradeFormError}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-[#4a4456] mb-1">รายการคะแนน</label>
                <input type="text" placeholder="เช่น สอบภาคปฏิบัติ" value={gradeForm.component_name}
                  onChange={e => setGradeForm({ ...gradeForm, component_name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">คะแนนที่ได้</label>
                  <input type="number" value={gradeForm.score}
                    onChange={e => setGradeForm({ ...gradeForm, score: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">คะแนนเต็ม</label>
                  <input type="number" value={gradeForm.max_score}
                    onChange={e => setGradeForm({ ...gradeForm, max_score: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#4a4456] mb-1">น้ำหนัก % ในเกรดสุดท้าย</label>
                <input type="number" value={gradeForm.weight}
                  onChange={e => setGradeForm({ ...gradeForm, weight: Number(e.target.value) })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                <p className="text-xs text-[#9a92a8] mt-1">ส่วนที่เหลือจะคำนวณจากคะแนนอัตโนมัติของ e-Learning</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#4a4456] mb-1">หมายเหตุ (ไม่บังคับ)</label>
                <textarea value={gradeForm.notes} onChange={e => setGradeForm({ ...gradeForm, notes: e.target.value })}
                  rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#e6e1ee] flex gap-3 justify-end">
              <button onClick={() => setShowGradeModal(false)} className="px-4 py-2 text-sm text-[#6b6478] hover:text-[#2D0F42]">
                ยกเลิก
              </button>
              <button onClick={handleSaveGrade} disabled={savingGrade}
                className="bg-[#4A1A6B] hover:bg-[#2D0F42] text-white text-sm font-medium px-6 py-2 rounded-lg disabled:opacity-50">
                {savingGrade ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
