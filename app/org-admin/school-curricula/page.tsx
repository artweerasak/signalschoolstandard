/**
 * app/org-admin/school-curricula/page.tsx
 * รายการหลักสูตรของโรงเรียนทหารสื่อสาร (org id=161) — org_admin ของหน่วยนี้
 * เท่านั้นที่เห็นเมนูนี้ (gate อยู่ที่ app/org-admin/layout.tsx) เลือกปีการศึกษา
 * แล้วดูรายการหลักสูตร กดเข้าไปดู roster ต่อ
 */
"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { api, CurriculumSummary } from "@/lib/api"
import Card from "@/components/ui/Card"
import PageHeader from "@/components/ui/PageHeader"
import StatusPill from "@/components/ui/StatusPill"

const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning"> = {
  draft: "neutral", submitted: "info", active: "success", closed: "warning",
}
const STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง", submitted: "ส่งแล้ว", active: "กำลังดำเนินการ", closed: "ปิดแล้ว",
}

export default function SchoolCurriculaPage() {
  const [curricula, setCurricula] = useState<CurriculumSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [year, setYear] = useState<number | "all">("all")

  useEffect(() => {
    api.listSchoolCurricula()
      .then(res => setCurricula(res.results))
      .catch(() => setError("โหลดรายการหลักสูตรไม่สำเร็จ"))
      .finally(() => setLoading(false))
  }, [])

  const years = useMemo(
    () => Array.from(new Set(curricula.map(c => c.academic_year))).sort((a, b) => b - a),
    [curricula]
  )
  const filtered = useMemo(
    () => (year === "all" ? curricula : curricula.filter(c => c.academic_year === year)),
    [curricula, year]
  )

  return (
    <div className="p-6 max-w-4xl">
      <PageHeader
        title="หลักสูตร รร.ส.สส."
        description="รายชื่อหลักสูตรของโรงเรียนทหารสื่อสาร กรมการทหารสื่อสาร — เลือกปีการศึกษาแล้วดูจำนวน/รายชื่อนักเรียนแต่ละหลักสูตร"
      />

      {loading && <p className="text-[#9a92a8] text-sm">กำลังโหลด...</p>}
      {error && <p className="text-red-500 text-sm">{error}</p>}

      {!loading && !error && (
        <>
          <div className="mb-4 flex items-center gap-2">
            <label className="text-sm text-[#6b6478]">ปีการศึกษา</label>
            <select
              value={year}
              onChange={e => setYear(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]"
            >
              <option value="all">ทุกปีการศึกษา</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {filtered.length === 0 ? (
            <Card className="p-6 text-center text-sm text-[#9a92a8]">ไม่พบหลักสูตร</Card>
          ) : (
            <div className="space-y-2">
              {filtered.map(c => (
                <Link key={c.id} href={`/org-admin/school-curricula/${c.id}`}>
                  <Card hoverable className="p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-[#2D0F42]">{c.name}</p>
                      <p className="text-xs text-[#9a92a8] mt-0.5">
                        รุ่น {c.batch_code} · ปีการศึกษา {c.academic_year} · {c.course_count} วิชา
                      </p>
                    </div>
                    <StatusPill tone={STATUS_TONE[c.status] ?? "neutral"}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </StatusPill>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
