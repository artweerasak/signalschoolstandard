/**
 * app/prep-personnel/enroll/[curriculumId]/page.tsx
 * บรรจุกำลังพลเข้าหลักสูตร (cascade enrollment) — บังคับ preview (dry-run)
 * ก่อนกดยืนยันจริงเสมอ เพราะ execute จริงเขียนเข้า enrollment จริงของ edX
 */
"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { api, EnrollDryRunResult, EnrollExecuteResult } from "@/lib/api"

function parseStudentIds(text: string): number[] {
  return Array.from(new Set(
    text.split(/[\s,]+/).map(s => s.trim()).filter(Boolean).map(Number).filter(n => !Number.isNaN(n) && n > 0)
  ))
}

export default function EnrollPage() {
  const params = useParams()
  const curriculumId = Number(params.curriculumId)

  const [idsText, setIdsText] = useState("")
  const [preview, setPreview] = useState<EnrollDryRunResult | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [result, setResult] = useState<EnrollExecuteResult | null>(null)
  const [error, setError] = useState("")

  const studentIds = parseStudentIds(idsText)

  const handlePreview = async () => {
    if (studentIds.length === 0) { setError("กรุณากรอกรหัสผู้ใช้ (user_id) อย่างน้อย 1 คน"); return }
    setError("")
    setResult(null)
    setPreviewing(true)
    try {
      const r = await api.previewEnrollStudents(curriculumId, studentIds)
      setPreview(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : "ตรวจสอบไม่สำเร็จ")
    } finally {
      setPreviewing(false)
    }
  }

  const handleExecute = async () => {
    if (!preview) return
    if (!confirm(`ยืนยันบรรจุกำลังพล ${studentIds.length} คนเข้าหลักสูตรนี้จริง? การกระทำนี้จะลงทะเบียนเรียนจริงในระบบ e-Learning`)) return
    setExecuting(true)
    setError("")
    try {
      const r = await api.enrollStudents(curriculumId, studentIds)
      setResult(r)
      setPreview(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "บรรจุไม่สำเร็จ")
    } finally {
      setExecuting(false)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <Link href="/prep-personnel" className="text-sm text-[#6b6478] hover:text-[#4A1A6B]">← กลับรายการหลักสูตร</Link>
        <h1 className="text-2xl font-bold text-[#4A1A6B] mt-2">บรรจุกำลังพลเข้าหลักสูตร</h1>
        <p className="text-sm text-[#6b6478] mt-1">ระบบจะลงทะเบียนกำลังพลเข้าเรียนทุกวิชาในหลักสูตรนี้โดยอัตโนมัติ — ตรวจสอบผลก่อนยืนยันเสมอ</p>
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-5 space-y-3">
        <label className="block text-sm font-medium text-[#4a4456]">รหัสผู้ใช้ (user_id) — คั่นด้วยจุลภาคหรือขึ้นบรรทัดใหม่</label>
        <textarea value={idsText} onChange={e => { setIdsText(e.target.value); setPreview(null); setResult(null) }}
          rows={4} placeholder="เช่น 101, 102, 103"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
        {studentIds.length > 0 && <p className="text-xs text-[#6b6478]">พบ {studentIds.length} รหัสผู้ใช้</p>}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>
        )}

        <button onClick={handlePreview} disabled={previewing || studentIds.length === 0}
          className="bg-[#4A1A6B] hover:bg-[#2D0F42] text-white text-sm font-medium px-5 py-2.5 rounded-lg disabled:opacity-50">
          {previewing ? "กำลังตรวจสอบ..." : "🔍 ตรวจสอบก่อนบรรจุจริง (Dry-run)"}
        </button>
      </div>

      {preview && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-[#2D0F42]">ผลตรวจสอบ (ยังไม่บรรจุจริง)</h2>
            <button onClick={handleExecute} disabled={executing}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50">
              {executing ? "กำลังบรรจุ..." : "✓ ยืนยันบรรจุจริง"}
            </button>
          </div>
          {preview.missing_student_ids.length > 0 && (
            <div className="bg-yellow-50 border-b border-yellow-200 text-yellow-800 px-4 py-2 text-sm">
              ⚠️ ไม่พบผู้ใช้รหัส: {preview.missing_student_ids.join(", ")}
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e6e1ee] bg-[#f7f5fa] text-left text-xs text-[#6b6478] uppercase">
                <th className="px-4 py-3">User ID</th>
                <th className="px-4 py-3">ผลรวม</th>
                <th className="px-4 py-3">รายละเอียดต่อวิชา</th>
              </tr>
            </thead>
            <tbody>
              {preview.preview.map(p => (
                <tr key={p.student_id} className="border-b border-[#f0ecf6]">
                  <td className="px-4 py-3 font-mono">{p.student_id}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      p.would_succeed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                    }`}>
                      {p.would_succeed ? "สำเร็จทุกวิชา" : "มีวิชาที่จะล้มเหลว"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#6b6478] space-y-1">
                    {p.courses.map(c => (
                      <div key={c.course_id} className={c.would_enroll ? "text-[#6b6478]" : "text-red-500"}>
                        {c.would_enroll ? "✓" : "✕"} {c.course_id} {c.error && `— ${c.error}`}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 space-y-2">
          <p className="font-medium text-emerald-800">
            บรรจุเรียบร้อย ({result.mode === "sync" ? "ดำเนินการเสร็จทันที" : "กำลังดำเนินการในพื้นหลัง"})
          </p>
          <p className="text-sm text-emerald-700">คำขอทั้งหมด {result.enrollment_request_ids.length} รายการ</p>
          {result.missing_student_ids.length > 0 && (
            <p className="text-sm text-yellow-700">ไม่พบผู้ใช้: {result.missing_student_ids.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  )
}
