/**
 * app/prep-school/curricula/[id]/page.tsx
 * รายละเอียดหลักสูตร — จัดการวิชาย่อย (เฉพาะสถานะร่าง) + ส่งต่อแผนกเตรียมพล
 */
"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { api, CurriculumDetail } from "@/lib/api"

const STATUS_LABELS: Record<string, string> = {
  draft: "ร่าง", submitted: "ส่งให้แผนกเตรียมพลแล้ว", active: "ใช้งาน", closed: "ปิดรุ่น",
}

interface CourseForm {
  course_id: string
  display_name: string
  credit_hours: number
  credits: number
  assessment_type: "score" | "pass_fail"
  passing_score: number | ""
  is_required: boolean
}
const EMPTY_COURSE_FORM: CourseForm = {
  course_id: "", display_name: "", credit_hours: 0, credits: 0,
  assessment_type: "score", passing_score: "", is_required: true,
}

export default function CurriculumDetailPage() {
  const params = useParams()
  const curriculumId = Number(params.id)
  const router = useRouter()

  const [curriculum, setCurriculum] = useState<CurriculumDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showCourseModal, setShowCourseModal] = useState(false)
  const [courseForm, setCourseForm] = useState<CourseForm>(EMPTY_COURSE_FORM)
  const [savingCourse, setSavingCourse] = useState(false)
  const [courseFormError, setCourseFormError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const load = () => {
    setLoading(true)
    api.getCurriculum(curriculumId)
      .then(setCurriculum)
      .catch(() => setError("ไม่พบหลักสูตรนี้ หรือคุณไม่มีสิทธิ์เข้าถึง"))
      .finally(() => setLoading(false))
  }

  useEffect(() => { if (curriculumId) load() }, [curriculumId])

  const isDraft = curriculum?.status === "draft"

  const openAddCourse = () => {
    setCourseForm(EMPTY_COURSE_FORM)
    setCourseFormError("")
    setShowCourseModal(true)
  }

  const handleSaveCourse = async () => {
    if (!courseForm.course_id.trim()) { setCourseFormError("กรุณากรอก Course ID"); return }
    if (!courseForm.display_name.trim()) { setCourseFormError("กรุณากรอกชื่อวิชา"); return }
    setSavingCourse(true)
    setCourseFormError("")
    try {
      await api.addCurriculumCourse(curriculumId, {
        ...courseForm,
        passing_score: courseForm.passing_score === "" ? undefined : Number(courseForm.passing_score),
      })
      setShowCourseModal(false)
      load()
    } catch (err) {
      setCourseFormError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด")
    } finally {
      setSavingCourse(false)
    }
  }

  const handleRemoveCourse = async (coursePk: number) => {
    if (!confirm("ยืนยันการลบวิชานี้ออกจากหลักสูตร?")) return
    try {
      await api.removeCurriculumCourse(curriculumId, coursePk)
      load()
    } catch {
      setError("ไม่สามารถลบวิชาได้")
    }
  }

  const handleSubmit = async () => {
    if (!curriculum || curriculum.courses.length === 0) {
      alert("ต้องมีอย่างน้อย 1 วิชาก่อนส่งให้แผนกเตรียมพล")
      return
    }
    if (!confirm("ยืนยันส่งหลักสูตรนี้ให้แผนกเตรียมพล? หลังส่งแล้วจะแก้ไขวิชาไม่ได้")) return
    setSubmitting(true)
    try {
      await api.submitCurriculum(curriculumId)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งไม่สำเร็จ")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="flex h-full items-center justify-center text-[#9a92a8]">กำลังโหลด...</div>
  if (error) return <div className="p-6"><div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div></div>
  if (!curriculum) return null

  return (
    <div className="p-6 space-y-6">
      <div>
        <Link href="/prep-school" className="text-sm text-[#6b6478] hover:text-[#4A1A6B]">← กลับรายการหลักสูตร</Link>
        <div className="flex items-center justify-between mt-2">
          <div>
            <h1 className="text-2xl font-bold text-[#4A1A6B]">{curriculum.name}</h1>
            <p className="text-sm text-[#6b6478] mt-1">รุ่น {curriculum.batch_code} · ปีการศึกษา {curriculum.academic_year}</p>
          </div>
          {isDraft && (
            <button onClick={handleSubmit} disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg disabled:opacity-50">
              {submitting ? "กำลังส่ง..." : "ส่งให้แผนกเตรียมพล →"}
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-[#9a92a8] text-xs">สถานะ</p>
          <p className="font-medium mt-0.5">{STATUS_LABELS[curriculum.status] || curriculum.status}</p>
        </div>
        <div>
          <p className="text-[#9a92a8] text-xs">หน่วยงาน</p>
          <p className="font-medium mt-0.5">{curriculum.organization_name || "-"}</p>
        </div>
        <div>
          <p className="text-[#9a92a8] text-xs">โควตารวม</p>
          <p className="font-medium mt-0.5">{curriculum.quota_total}</p>
        </div>
        <div className="col-span-2 md:col-span-4">
          <p className="text-[#9a92a8] text-xs">คุณสมบัติผู้เข้าเรียน</p>
          <p className="font-medium mt-0.5">
            {curriculum.eligible_rank_min_display || curriculum.eligible_rank_max_display
              ? `ยศ ${curriculum.eligible_rank_min_display || "ไม่จำกัด"} – ${curriculum.eligible_rank_max_display || "ไม่จำกัด"}`
              : "ไม่จำกัดช่วงยศ"}
            {curriculum.eligible_min_years_in_rank ? ` · ครองยศมาแล้วอย่างน้อย ${curriculum.eligible_min_years_in_rank} ปี` : ""}
            {curriculum.eligible_personnel_type_display ? ` · ${curriculum.eligible_personnel_type_display}` : ""}
          </p>
          {curriculum.eligible_rank_class && (
            <p className="text-xs text-[#9a92a8] mt-1">หมายเหตุ: {curriculum.eligible_rank_class}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-[#2D0F42]">วิชาในหลักสูตร ({curriculum.courses.length})</h2>
        {isDraft && (
          <button onClick={openAddCourse}
            className="bg-[#4A1A6B] hover:bg-[#2D0F42] text-white text-sm font-medium px-4 py-2 rounded-lg">
            + เพิ่มวิชา
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#f0ecf6] overflow-hidden">
        {curriculum.courses.length === 0 ? (
          <div className="py-12 text-center text-[#9a92a8] text-sm">ยังไม่มีวิชาในหลักสูตรนี้</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e6e1ee] bg-[#f7f5fa] text-left text-xs text-[#6b6478] uppercase">
                <th className="px-4 py-3">ลำดับ</th>
                <th className="px-4 py-3">ชื่อวิชา</th>
                <th className="px-4 py-3">Course ID</th>
                <th className="px-4 py-3">ชั่วโมง</th>
                <th className="px-4 py-3">หน่วยกิต</th>
                <th className="px-4 py-3">การวัดผล</th>
                {isDraft && <th className="px-4 py-3">จัดการ</th>}
              </tr>
            </thead>
            <tbody>
              {curriculum.courses.map(c => (
                <tr key={c.id} className="border-b border-[#f0ecf6] hover:bg-[#f7f5fa]">
                  <td className="px-4 py-3 text-[#6b6478]">{c.sequence_order}</td>
                  <td className="px-4 py-3 font-medium">{c.display_name} {c.is_required && <span className="text-xs text-red-500 ml-1">*บังคับ</span>}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[#6b6478]">{c.course_id}</td>
                  <td className="px-4 py-3 text-[#6b6478]">{c.credit_hours}</td>
                  <td className="px-4 py-3 text-[#6b6478]">{c.credits}</td>
                  <td className="px-4 py-3 text-[#6b6478]">
                    {c.assessment_type === "score" ? `คะแนน (ผ่าน ${c.passing_score ?? "-"})` : "ผ่าน/ไม่ผ่าน"}
                  </td>
                  {isDraft && (
                    <td className="px-4 py-3">
                      <button onClick={() => handleRemoveCourse(c.id)} className="text-red-500 hover:underline text-xs font-medium">
                        ลบ
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCourseModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-[#e6e1ee] flex items-center justify-between">
              <h3 className="font-bold text-[#2D0F42]">เพิ่มวิชาในหลักสูตร</h3>
              <button onClick={() => setShowCourseModal(false)} className="text-[#9a92a8] hover:text-[#6b6478]">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {courseFormError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{courseFormError}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-[#4a4456] mb-1">Course ID (edX)</label>
                <input type="text" placeholder="เช่น course-v1:Signal+SIG101+2570" value={courseForm.course_id}
                  onChange={e => setCourseForm({ ...courseForm, course_id: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#4a4456] mb-1">ชื่อวิชา</label>
                <input type="text" value={courseForm.display_name}
                  onChange={e => setCourseForm({ ...courseForm, display_name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">จำนวนชั่วโมง</label>
                  <input type="number" value={courseForm.credit_hours}
                    onChange={e => setCourseForm({ ...courseForm, credit_hours: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">หน่วยกิต</label>
                  <input type="number" value={courseForm.credits}
                    onChange={e => setCourseForm({ ...courseForm, credits: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#4a4456] mb-1">ประเภทการวัดผล</label>
                <select value={courseForm.assessment_type}
                  onChange={e => setCourseForm({ ...courseForm, assessment_type: e.target.value as "score" | "pass_fail" })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]">
                  <option value="score">คะแนน/เกรด</option>
                  <option value="pass_fail">ผ่าน/ไม่ผ่าน</option>
                </select>
              </div>
              {courseForm.assessment_type === "score" && (
                <div>
                  <label className="block text-sm font-medium text-[#4a4456] mb-1">คะแนนผ่าน (ไม่บังคับ)</label>
                  <input type="number" value={courseForm.passing_score}
                    onChange={e => setCourseForm({ ...courseForm, passing_score: e.target.value === "" ? "" : Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                </div>
              )}
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_required" checked={courseForm.is_required}
                  onChange={e => setCourseForm({ ...courseForm, is_required: e.target.checked })}
                  className="w-4 h-4 accent-[#4A1A6B]" />
                <label htmlFor="is_required" className="text-sm text-[#4a4456]">วิชาบังคับ</label>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#e6e1ee] flex gap-3 justify-end">
              <button onClick={() => setShowCourseModal(false)} className="px-4 py-2 text-sm text-[#6b6478] hover:text-[#2D0F42]">
                ยกเลิก
              </button>
              <button onClick={handleSaveCourse} disabled={savingCourse}
                className="bg-[#4A1A6B] hover:bg-[#2D0F42] text-white text-sm font-medium px-6 py-2 rounded-lg disabled:opacity-50">
                {savingCourse ? "กำลังบันทึก..." : "เพิ่มวิชา"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
