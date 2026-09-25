/**
 * app/prep-personnel/quota-report/[curriculumId]/page.tsx
 * ตั้ง/แก้ไขโควตาแยกตามหน่วยงานจริง (เช่น กรมการทหารสื่อสาร 5 นาย,
 * รร.ส.สส. 2 นาย, ส.1 2 นาย) พร้อมเทียบกับยอดขอ/บรรจุจริง — แก้ไขได้ตลอด
 * อายุหลักสูตร (ต่างจากโควตารายภูมิภาคเดิมที่ตั้งได้แค่ตอนสร้างหลักสูตร)
 */
"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { api, OrgQuotaReport, Organization } from "@/lib/api"

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
  const [report, setReport] = useState<OrgQuotaReport | null>(null)
  const [allOrgs, setAllOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [editValues, setEditValues] = useState<Record<number, string>>({})
  const [savingOrgId, setSavingOrgId] = useState<number | null>(null)

  const [addOrgId, setAddOrgId] = useState("")
  const [addQuota, setAddQuota] = useState("")
  const [adding, setAdding] = useState(false)

  const load = () => {
    if (!curriculumId) return
    setLoading(true)
    Promise.all([api.getOrgQuotas(curriculumId), api.organizationsPublic()])
      .then(([r, orgs]) => { setReport(r); setAllOrgs(orgs.results) })
      .catch(() => setError("ไม่สามารถโหลดรายงานได้"))
      .finally(() => setLoading(false))
  }

  useEffect(load, [curriculumId])

  const handleSaveQuota = async (organizationId: number) => {
    const raw = editValues[organizationId]
    const quota = Number(raw)
    if (raw === undefined || Number.isNaN(quota) || quota < 0) return
    setSavingOrgId(organizationId)
    setError("")
    try {
      await api.setOrgQuota(curriculumId, organizationId, quota)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ")
    } finally {
      setSavingOrgId(null)
    }
  }

  const handleAddOrg = async () => {
    const orgId = Number(addOrgId)
    const quota = Number(addQuota)
    if (!orgId) { setError("กรุณาเลือกหน่วยงาน"); return }
    if (Number.isNaN(quota) || quota < 0) { setError("กรุณากรอกโควตาให้ถูกต้อง"); return }
    setAdding(true)
    setError("")
    try {
      await api.setOrgQuota(curriculumId, orgId, quota)
      setAddOrgId("")
      setAddQuota("")
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่มไม่สำเร็จ")
    } finally {
      setAdding(false)
    }
  }

  if (loading) return <div className="flex h-full items-center justify-center text-[#9a92a8]">กำลังโหลด...</div>
  if (error && !report) return <div className="p-6"><div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div></div>
  if (!report) return null

  const usedOrgIds = new Set(report.org_quotas.map(r => r.organization_id))
  const availableOrgs = allOrgs.filter(o => !usedOrgIds.has(o.id))

  return (
    <div className="p-6 space-y-6">
      <div>
        <Link href="/prep-personnel" className="text-sm text-[#6b6478] hover:text-[#4A1A6B]">← กลับรายการหลักสูตร</Link>
        <h1 className="text-2xl font-bold text-[#4A1A6B] mt-2">โควตาตามหน่วยงาน</h1>
        <p className="text-sm text-[#6b6478] mt-1">{report.curriculum_name}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      <div className="bg-white rounded-xl border shadow-sm p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium">ภาพรวมทั้งประเทศ</p>
          <p className="text-sm text-[#6b6478]">
            ขอ {report.national_requested} / โควตารวม {report.national_quota} (บรรจุสำเร็จแล้ว {report.national_filled})
          </p>
        </div>
        <Bar requested={report.national_requested} quota={report.national_quota} />
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-5">
        <h2 className="font-semibold text-[#2D0F42] mb-3">เพิ่มหน่วยงานเข้าโควตา</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs text-[#6b6478] mb-1">หน่วยงาน</label>
            <select value={addOrgId} onChange={e => setAddOrgId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]">
              <option value="">— เลือกหน่วยงาน —</option>
              {availableOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div className="w-32">
            <label className="block text-xs text-[#6b6478] mb-1">โควตา</label>
            <input type="number" min={0} value={addQuota} onChange={e => setAddQuota(e.target.value)}
              placeholder="เช่น 5"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
          </div>
          <button onClick={handleAddOrg} disabled={adding || !addOrgId}
            className="bg-[#4A1A6B] hover:bg-[#2D0F42] text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50">
            {adding ? "กำลังเพิ่ม..." : "+ เพิ่ม"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#f0ecf6] overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-[#2D0F42]">แยกตามหน่วยงาน</h2>
        </div>
        {report.org_quotas.length === 0 ? (
          <div className="py-12 text-center text-[#9a92a8] text-sm">ยังไม่มีการตั้งโควตาให้หน่วยงานไหนเลย — เพิ่มด้านบน</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e6e1ee] bg-[#f7f5fa] text-left text-xs text-[#6b6478] uppercase">
                <th className="px-4 py-3">หน่วยงาน</th>
                <th className="px-4 py-3 w-40">โควตา</th>
                <th className="px-4 py-3">ยอดขอ</th>
                <th className="px-4 py-3">บรรจุสำเร็จ</th>
                <th className="px-4 py-3 w-32">สัดส่วน</th>
              </tr>
            </thead>
            <tbody>
              {report.org_quotas.map(r => {
                const editValue = editValues[r.organization_id] ?? String(r.quota)
                const dirty = editValue !== String(r.quota)
                return (
                  <tr key={r.organization_id} className="border-b border-[#f0ecf6] hover:bg-[#f7f5fa]">
                    <td className="px-4 py-3 font-medium">{r.organization_name}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <input type="number" min={0} value={editValue}
                          onChange={e => setEditValues(v => ({ ...v, [r.organization_id]: e.target.value }))}
                          className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]" />
                        {dirty && (
                          <button onClick={() => handleSaveQuota(r.organization_id)} disabled={savingOrgId === r.organization_id}
                            className="text-xs text-[#4A1A6B] hover:underline font-medium disabled:opacity-50">
                            {savingOrgId === r.organization_id ? "..." : "บันทึก"}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className={`px-4 py-3 ${r.requested > r.quota ? "text-red-600 font-medium" : "text-[#6b6478]"}`}>
                      {r.requested}
                    </td>
                    <td className="px-4 py-3 text-[#6b6478]">{r.filled}</td>
                    <td className="px-4 py-3"><Bar requested={r.requested} quota={r.quota} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
