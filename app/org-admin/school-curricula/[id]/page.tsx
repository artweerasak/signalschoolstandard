/**
 * app/org-admin/school-curricula/[id]/page.tsx
 * รายชื่อ + จำนวนนักเรียนที่บรรจุในหลักสูตรนี้แล้ว (รร.ส.สส. เท่านั้น)
 */
"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { api, SchoolCurriculumRoster } from "@/lib/api"
import Card from "@/components/ui/Card"
import PageHeader from "@/components/ui/PageHeader"

export default function SchoolCurriculumRosterPage() {
  const params = useParams()
  const curriculumId = Number(params.id)

  const [roster, setRoster] = useState<SchoolCurriculumRoster | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [q, setQ] = useState("")

  useEffect(() => {
    if (!curriculumId) return
    api.getSchoolCurriculumRoster(curriculumId)
      .then(setRoster)
      .catch(() => setError("ไม่พบหลักสูตรนี้ หรือไม่มีสิทธิ์เข้าถึง"))
      .finally(() => setLoading(false))
  }, [curriculumId])

  const filtered = roster?.results.filter(r =>
    r.full_name.includes(q) || r.unit.includes(q) || r.rank_display.includes(q)
  ) ?? []

  return (
    <div className="p-6 max-w-4xl">
      <Link href="/org-admin/school-curricula" className="text-sm text-[#7B3FA0] hover:underline mb-3 inline-block">
        ← กลับไปรายการหลักสูตร
      </Link>

      {loading && <p className="text-[#9a92a8] text-sm">กำลังโหลด...</p>}
      {error && <p className="text-red-500 text-sm">{error}</p>}

      {roster && (
        <>
          <PageHeader
            title={roster.curriculum_name}
            description={`รุ่น ${roster.batch_code} · ปีการศึกษา ${roster.academic_year} · นักเรียน ${roster.count} คน`}
          />

          <Card>
            <div className="p-4 border-b border-[#f0ecf6] flex items-center justify-between gap-3">
              <h3 className="font-semibold text-[#2D0F42]">รายชื่อนักเรียน <span className="text-[#9a92a8] font-normal text-sm">({roster.count} คน)</span></h3>
              <input value={q} onChange={e => setQ(e.target.value)}
                placeholder="ค้นหา..." className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[#9a92a8] border-b border-[#f0ecf6]">
                    <th className="px-4 py-2 font-medium">ยศ</th>
                    <th className="px-4 py-2 font-medium">ชื่อ-นามสกุล</th>
                    <th className="px-4 py-2 font-medium">หน่วยต้นสังกัด</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-[#9a92a8]">ไม่พบนักเรียน</td></tr>
                  ) : filtered.map(r => (
                    <tr key={r.student_id} className="border-b border-[#f7f5fa] last:border-0">
                      <td className="px-4 py-2.5 text-[#6b6478]">{r.rank_display || "—"}</td>
                      <td className="px-4 py-2.5 font-medium text-[#2D0F42]">{r.full_name}</td>
                      <td className="px-4 py-2.5 text-[#6b6478]">{r.unit || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
