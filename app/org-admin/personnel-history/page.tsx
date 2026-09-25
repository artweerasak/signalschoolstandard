/**
 * app/org-admin/personnel-history/page.tsx
 * ประวัติการเรียนของกำลังพลในหน่วย — org_admin ทุกหน่วยเห็นเมนูนี้ (เฉพาะ
 * กำลังพลของหน่วยตัวเอง บังคับ scope ที่ backend ผ่าน get_org_scope())
 */
"use client"

import { useEffect, useMemo, useState } from "react"
import { api, OrgCompletionsResponse } from "@/lib/api"
import Card from "@/components/ui/Card"
import PageHeader from "@/components/ui/PageHeader"
import StatusPill from "@/components/ui/StatusPill"

interface FlatRow {
  student_id: number
  full_name: string
  rank_display: string
  curriculum_name: string
  academic_year: number
  course_name: string
  passed: boolean | null
  completed_at: string | null
}

function formatDateTH(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })
  } catch { return iso }
}

export default function PersonnelHistoryPage() {
  const [data, setData] = useState<OrgCompletionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [q, setQ] = useState("")

  useEffect(() => {
    api.getOrgCompletions()
      .then(setData)
      .catch(() => setError("โหลดข้อมูลประวัติการเรียนไม่สำเร็จ"))
      .finally(() => setLoading(false))
  }, [])

  const rows: FlatRow[] = useMemo(() => {
    if (!data) return []
    const out: FlatRow[] = []
    for (const person of data.results) {
      for (const curriculum of person.curricula) {
        for (const course of curriculum.courses) {
          if (!course.grade_visible || course.passed === null) continue
          out.push({
            student_id: person.student_id,
            full_name: person.full_name,
            rank_display: person.rank_display,
            curriculum_name: curriculum.curriculum_name,
            academic_year: curriculum.academic_year,
            course_name: course.display_name,
            passed: course.passed,
            completed_at: course.completed_at,
          })
        }
      }
    }
    return out.sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
  }, [data])

  const filtered = rows.filter(r =>
    r.full_name.includes(q) || r.curriculum_name.includes(q) || r.course_name.includes(q)
  )

  return (
    <div className="p-6 max-w-5xl">
      <PageHeader
        title="ประวัติการเรียนของกำลังพล"
        description="วิชา/หลักสูตรที่กำลังพลในสังกัดเรียนจบไปแล้ว และผลการเรียน — เฉพาะกำลังพลของหน่วยตัวเอง"
      />

      {loading && <p className="text-[#9a92a8] text-sm">กำลังโหลด...</p>}
      {error && <p className="text-red-500 text-sm">{error}</p>}

      {!loading && !error && (
        <Card>
          <div className="p-4 border-b border-[#f0ecf6] flex items-center justify-between gap-3">
            <h3 className="font-semibold text-[#2D0F42]">
              รายการที่จบแล้ว <span className="text-[#9a92a8] font-normal text-sm">({filtered.length} รายการ)</span>
            </h3>
            <input value={q} onChange={e => setQ(e.target.value)}
              placeholder="ค้นหาชื่อ/หลักสูตร/วิชา..."
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[#9a92a8] border-b border-[#f0ecf6]">
                  <th className="px-4 py-2 font-medium">กำลังพล</th>
                  <th className="px-4 py-2 font-medium">หลักสูตร</th>
                  <th className="px-4 py-2 font-medium">วิชา</th>
                  <th className="px-4 py-2 font-medium">ผลการเรียน</th>
                  <th className="px-4 py-2 font-medium">วันที่</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-[#9a92a8]">ยังไม่มีข้อมูลการเรียนจบ</td></tr>
                ) : filtered.map((r, i) => (
                  <tr key={`${r.student_id}-${r.course_name}-${i}`} className="border-b border-[#f7f5fa] last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="text-[#6b6478]">{r.rank_display}</span>{" "}
                      <span className="font-medium text-[#2D0F42]">{r.full_name}</span>
                    </td>
                    <td className="px-4 py-2.5 text-[#6b6478]">{r.curriculum_name} <span className="text-xs text-[#9a92a8]">({r.academic_year})</span></td>
                    <td className="px-4 py-2.5 text-[#6b6478]">{r.course_name}</td>
                    <td className="px-4 py-2.5">
                      <StatusPill tone={r.passed ? "success" : "error"}>{r.passed ? "ผ่าน" : "ไม่ผ่าน"}</StatusPill>
                    </td>
                    <td className="px-4 py-2.5 text-[#6b6478]">{r.completed_at ? formatDateTH(r.completed_at) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
