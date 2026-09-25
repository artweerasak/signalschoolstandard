/**
 * app/dashboard/certificates/page.tsx
 * แจ้งเตือนใบประกาศใกล้หมดอายุ/หมดอายุแล้ว
 */
"use client"

import { useEffect, useState } from "react"
import { api, CertificateAlert } from "@/lib/api"

function AlertTable({ data, loading, type }: { data: CertificateAlert[]; loading: boolean; type: "expiring" | "expired" }) {
  if (loading) return <div className="py-10 text-center text-[#9a92a8]">กำลังโหลด...</div>
  if (!data.length) return (
    <div className="py-10 text-center text-[#9a92a8]">
      {type === "expiring" ? "ไม่มีใบประกาศที่ใกล้หมดอายุ" : "ไม่มีใบประกาศที่หมดอายุแล้ว"}
    </div>
  )
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#e6e1ee] bg-[#f7f5fa] text-left text-xs text-[#6b6478] uppercase">
            <th className="px-4 py-3">ชื่อ-สกุล</th>
            <th className="px-4 py-3">ยศ</th>
            <th className="px-4 py-3">หน่วย</th>
            <th className="px-4 py-3">หลักสูตร</th>
            <th className="px-4 py-3">วันหมดอายุ</th>
            <th className="px-4 py-3">{type === "expiring" ? "วันที่เหลือ" : "หมดอายุแล้ว"}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item, i) => {
            const isUrgent = type === "expiring" && item.days_left !== null && item.days_left <= 7
            return (
              <tr key={`${item.user_id}-${item.course_id}-${i}`} className="border-b border-[#f0ecf6] hover:bg-[#f7f5fa]">
                <td className="px-4 py-3 font-medium text-[#2D0F42]">{item.full_name}</td>
                <td className="px-4 py-3 text-[#4a4456]">{item.rank}</td>
                <td className="px-4 py-3 text-[#6b6478]">{item.unit}</td>
                <td className="px-4 py-3 text-[#6b6478] text-xs">{item.course_name || item.course_id}</td>
                <td className="px-4 py-3 text-[#6b6478]">{item.expiry_date}</td>
                <td className="px-4 py-3">
                  {type === "expiring" && item.days_left !== null ? (
                    <span className={`font-semibold ${isUrgent ? "text-red-600" : "text-amber-600"}`}>
                      {item.days_left} วัน
                    </span>
                  ) : (
                    <span className="text-red-600 font-semibold text-xs">หมดอายุแล้ว</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function CertificatesPage() {
  const [expiring, setExpiring] = useState<CertificateAlert[]>([])
  const [expired, setExpired] = useState<CertificateAlert[]>([])
  const [loadingExpiring, setLoadingExpiring] = useState(true)
  const [loadingExpired, setLoadingExpired] = useState(true)
  const [days, setDays] = useState(30)
  const [error, setError] = useState("")

  useEffect(() => {
    setLoadingExpiring(true)
    api.certificatesExpiring(days)
      .then((r) => setExpiring(r.results))
      .catch(() => setError("ไม่สามารถโหลดข้อมูลได้"))
      .finally(() => setLoadingExpiring(false))
  }, [days])

  useEffect(() => {
    setLoadingExpired(true)
    api.certificatesExpired()
      .then((r) => setExpired(r.results))
      .catch(() => {})
      .finally(() => setLoadingExpired(false))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[#2D0F42]">แจ้งเตือนใบประกาศ</h2>
        <p className="text-sm text-[#6b6478] mt-1">ติดตามใบประกาศที่ใกล้หมดอายุหรือหมดอายุแล้ว</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {/* Expiring soon */}
      <div className="bg-white rounded-xl shadow-sm border border-[#f0ecf6]">
        <div className="px-6 py-4 border-b border-[#f0ecf6] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-amber-500 text-xl">⚠️</span>
            <div>
              <h3 className="font-semibold text-[#2D0F42]">ใกล้หมดอายุ</h3>
              <p className="text-xs text-[#6b6478]">{expiring.length} รายการ</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[#6b6478]">แสดงภายใน</span>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A1A6B]"
            >
              <option value={7}>7 วัน</option>
              <option value={14}>14 วัน</option>
              <option value={30}>30 วัน</option>
              <option value={60}>60 วัน</option>
              <option value={90}>90 วัน</option>
            </select>
          </div>
        </div>
        <AlertTable data={expiring} loading={loadingExpiring} type="expiring" />
      </div>

      {/* Expired */}
      <div className="bg-white rounded-xl shadow-sm border border-[#f0ecf6]">
        <div className="px-6 py-4 border-b border-[#f0ecf6] flex items-center gap-3">
          <span className="text-red-500 text-xl">🚨</span>
          <div>
            <h3 className="font-semibold text-[#2D0F42]">หมดอายุแล้ว</h3>
            <p className="text-xs text-[#6b6478]">{expired.length} รายการ</p>
          </div>
        </div>
        <AlertTable data={expired} loading={loadingExpired} type="expired" />
      </div>
    </div>
  )
}
