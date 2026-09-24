/**
 * app/prep-personnel/quota-report/[curriculumId]/page.tsx
 * เปรียบเทียบโควตาที่ตั้งไว้ vs ยอดขอจริง แยกตามกองทัพภาค
 */
"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { api, QuotaDemandReport } from "@/lib/api"

function Bar({ requested, quota }: { requested: number; quota: number }) {
  const pct = quota > 0 ? Math.min(100, Math.round((requested / quota) * 100)) : 0
  const over = quota > 0 && requested > quota
  return (
    <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
      <div className={`h-3 rounded-full transition-all ${over ? "bg-red-500" : "bg-[#4A1A6B]"}`}
        style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function QuotaReportPage() {
  const params = useParams()
  const curriculumId = Number(params.curriculumId)
  const [report, setReport] = useState<QuotaDemandReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!curriculumId) return
    api.getQuotaDemandReport(curriculumId)
      .then(setReport)
      .catch(() => setError("ไม่สามารถโหลดรายงานได้"))
      .finally(() => setLoading(false))
  }, [curriculumId])

  if (loading) return <div className="flex h-full items-center justify-center text-gray-400">กำลังโหลด...</div>
  if (error) return <div className="p-6"><div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div></div>
  if (!report) return null

  return (
    <div className="p-6 space-y-6">
      <div>
        <Link href="/prep-personnel" className="text-sm text-gray-500 hover:text-[#4A1A6B]">← กลับรายการหลักสูตร</Link>
        <h1 className="text-2xl font-bold text-[#4A1A6B] mt-2">รายงานความคับคั่งและความต้องการศึกษา</h1>
        <p className="text-sm text-gray-500 mt-1">{report.curriculum_name}</p>
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium">ภาพรวมทั้งประเทศ</p>
          <p className="text-sm text-gray-500">
            ขอ {report.national_requested} / โควตา {report.national_quota} (บรรจุสำเร็จแล้ว {report.national_filled})
          </p>
        </div>
        <Bar requested={report.national_requested} quota={report.national_quota} />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-[#2D0F42]">แยกตามกองทัพภาค</h2>
        </div>
        {report.region_quotas.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">ยังไม่มีการตั้งโควตารายภูมิภาคสำหรับหลักสูตรนี้</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500 uppercase">
                <th className="px-4 py-3">ทภ.</th>
                <th className="px-4 py-3">โควตา</th>
                <th className="px-4 py-3">ยอดขอ</th>
                <th className="px-4 py-3">บรรจุสำเร็จ</th>
                <th className="px-4 py-3 w-40">สัดส่วน</th>
              </tr>
            </thead>
            <tbody>
              {report.region_quotas.map(r => (
                <tr key={r.army_region} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">ทภ.{r.army_region}</td>
                  <td className="px-4 py-3 text-gray-600">{r.quota}</td>
                  <td className={`px-4 py-3 ${r.requested > r.quota ? "text-red-600 font-medium" : "text-gray-600"}`}>
                    {r.requested}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.filled}</td>
                  <td className="px-4 py-3"><Bar requested={r.requested} quota={r.quota} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
