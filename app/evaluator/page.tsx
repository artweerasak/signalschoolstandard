/**
 * app/evaluator/page.tsx
 * รายการหลักสูตรให้เลือกเข้าไปจัดการแบบประเมิน + ติดตามผล (แต่ละหลักสูตร
 * แยกหน้าไปที่ /evaluator/[curriculumId] กันหน้านี้ยาวเกินไปเมื่อ 1 ปี
 * การศึกษามีหลายหลักสูตร) + banner เตือนครูอาจารย์ค้างส่งคะแนนข้ามหลักสูตร
 */
"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { api, EvaluatorCurriculumItem, GradingStatusReport } from "@/lib/api"
import Card from "@/components/ui/Card"
import PageHeader from "@/components/ui/PageHeader"
import StatusPill from "@/components/ui/StatusPill"

const STATUS_LABELS: Record<string, string> = {
  submitted: "ส่งแล้ว", active: "กำลังดำเนินการ", closed: "ปิดรุ่น",
}
const STATUS_TONES: Record<string, "info" | "success" | "neutral"> = {
  submitted: "info", active: "success", closed: "neutral",
}

export default function EvaluatorPage() {
  const [curricula, setCurricula] = useState<EvaluatorCurriculumItem[]>([])
  const [curriculaLoading, setCurriculaLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [yearMenuOpen, setYearMenuOpen] = useState(false)
  const [error, setError] = useState("")

  const [gradingStatus, setGradingStatus] = useState<GradingStatusReport | null>(null)
  const [gradingStatusLoading, setGradingStatusLoading] = useState(true)
  const [showAllPending, setShowAllPending] = useState(false)

  useEffect(() => {
    api.listEvaluatorCurricula()
      .then(r => {
        setCurricula(r.results)
        if (r.results.length > 0) setSelectedYear(r.results[0].academic_year) // เรียงปีล่าสุดมาก่อนแล้วจาก backend
      })
      .catch(() => setError("โหลดรายการหลักสูตรไม่สำเร็จ"))
      .finally(() => setCurriculaLoading(false))

    api.getGradingStatusReport()
      .then(setGradingStatus)
      .catch(() => {})
      .finally(() => setGradingStatusLoading(false))
  }, [])

  const years = useMemo(
    () => Array.from(new Set(curricula.map(c => c.academic_year))).sort((a, b) => b - a),
    [curricula]
  )
  const curriculaForYear = useMemo(
    () => curricula.filter(c => c.academic_year === selectedYear),
    [curricula, selectedYear]
  )

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <PageHeader
        title="การประเมินผล"
        description="เลือกหลักสูตรเพื่อสร้างแบบประเมิน ดูผลสรุป และติดตามผลการเรียนของนักเรียน"
      />

      {error && (
        <div className="bg-[#fee2e2] border border-[#f3a0a0] text-[#b91c1c] px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      {!gradingStatusLoading && gradingStatus && gradingStatus.count > 0 && (
        <Card className={`p-5 border-2 ${gradingStatus.results.some(r => r.is_overdue) ? "border-red-300 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-[#2D0F42]">ครูอาจารย์ค้างส่งคะแนน ({gradingStatus.count} วิชา)</h2>
            {gradingStatus.results.length > 5 && (
              <button onClick={() => setShowAllPending(v => !v)} className="text-xs text-[#4A1A6B] hover:underline shrink-0">
                {showAllPending ? "ย่อ" : `ดูทั้งหมด (${gradingStatus.results.length})`}
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {(showAllPending ? gradingStatus.results : gradingStatus.results.slice(0, 5)).map(r => (
              <div key={r.curriculum_course_id}
                className={`flex items-center justify-between gap-2 text-sm px-3 py-2 rounded-lg ${r.is_overdue ? "bg-red-100" : "bg-white"}`}>
                <div className="min-w-0">
                  <p className="font-medium text-[#2D0F42] truncate">
                    {r.course_display_name} <span className="text-xs text-[#9a92a8] font-normal">— {r.curriculum_name}</span>
                  </p>
                  <p className="text-xs text-[#6b6478] truncate">
                    ครู: {r.instructors.length > 0 ? r.instructors.map(i => i.full_name).join(", ") : "ยังไม่ได้มอบหมายครู"}
                    {" · "}เหลือ {r.pending_count}/{r.enrolled_count} คน
                    {r.end_date && ` · กำหนดจบ ${r.end_date}`}
                  </p>
                </div>
                {r.is_overdue && <StatusPill tone="error">เกินกำหนด</StatusPill>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {curriculaLoading ? (
        <p className="text-[#9a92a8] text-sm">กำลังโหลดรายการหลักสูตร...</p>
      ) : curricula.length === 0 ? (
        <Card className="p-6 text-center text-sm text-[#9a92a8]">ยังไม่มีหลักสูตรที่ส่งให้แผนกเตรียมพลแล้ว</Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#6b6478]">ปีการศึกษา</span>
            <div className="relative">
              <button onClick={() => setYearMenuOpen(v => !v)}
                className="flex items-center gap-2 bg-white border border-[#d9d2e6] rounded-xl px-4 py-2 text-sm font-medium text-[#2D0F42] shadow-sm hover:border-[#4A1A6B] transition-colors min-w-[120px] justify-between">
                {selectedYear}
                <span className={`text-[#9a92a8] text-xs transition-transform ${yearMenuOpen ? "rotate-180" : ""}`}>▾</span>
              </button>
              {yearMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setYearMenuOpen(false)} />
                  <div className="absolute z-20 mt-1.5 w-full min-w-[140px] bg-white border border-[#e6e1ee] rounded-xl shadow-lg overflow-hidden py-1">
                    {years.map(y => (
                      <button key={y} onClick={() => { setSelectedYear(y); setYearMenuOpen(false) }}
                        className={`w-full text-left px-4 py-2 text-sm transition-colors
                          ${selectedYear === y ? "bg-[#4A1A6B] text-white font-medium" : "text-[#4a4456] hover:bg-[#f7f5fa]"}`}>
                        {y}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {curriculaForYear.length === 0 ? (
            <Card className="p-6 text-center text-sm text-[#9a92a8]">ไม่มีหลักสูตรของปีนี้</Card>
          ) : (
            <div className="space-y-2">
              {curriculaForYear.map(c => (
                <Link key={c.id} href={`/evaluator/${c.id}`}>
                  <Card hoverable className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-[#2D0F42] truncate">
                        {c.name} <span className="text-[#9a92a8] font-normal">รุ่น {c.batch_code}</span>
                      </p>
                      {c.organization_name && <p className="text-xs text-[#9a92a8] truncate mt-0.5">{c.organization_name}</p>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <StatusPill tone={STATUS_TONES[c.status] ?? "neutral"}>{STATUS_LABELS[c.status] ?? c.status}</StatusPill>
                      <span className="text-[#9a92a8]">→</span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
