/**
 * app/my/certificates/page.tsx
 * หน้าใบประกาศทั้งหมดของกำลังพล
 */
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { api, MyCertificate } from "@/lib/api"

const statusStyles: Record<string, string> = {
  active:  "bg-green-100 text-green-700",
  expired: "bg-red-100 text-red-700",
  renewed: "bg-blue-100 text-blue-700",
  revoked: "bg-gray-100 text-gray-600",
}

function DaysLeftBadge({ days }: { days: number | null }) {
  if (days === null) return null
  if (days < 0)  return <span className="text-red-500 text-xs">หมดอายุไปแล้ว {Math.abs(days)} วัน</span>
  if (days <= 7)  return <span className="text-red-600 font-bold text-xs">⚠️ เหลืออีก {days} วัน!</span>
  if (days <= 30) return <span className="text-yellow-600 text-xs">⚠️ เหลืออีก {days} วัน</span>
  return <span className="text-gray-400 text-xs">เหลืออีก {days} วัน</span>
}

export default function MyCertificatesPage() {
  const [certs, setCerts] = useState<MyCertificate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.myCertificates()
      .then((res) => setCerts(res.results))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold text-[#2D0F42]">ใบประกาศของฉัน</h2>
        <p className="text-gray-500 text-sm mt-1">ติดตามสถานะและวันหมดอายุใบประกาศทุกหลักสูตร</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-5 border border-gray-100 animate-pulse">
              <div className="h-4 w-64 bg-gray-100 rounded mb-3" />
              <div className="h-3 w-40 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : certs.length === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center border border-gray-100">
          <p className="text-4xl mb-3">📜</p>
          <p className="text-gray-500">ยังไม่มีใบประกาศ</p>
        </div>
      ) : (
        <div className="space-y-3">
          {certs.map((cert) => (
            <div key={cert.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-800">{cert.course_name}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{cert.course_id}</p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${statusStyles[cert.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {cert.status_display}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                <div>
                  <p className="text-xs text-gray-400">วันที่ได้รับ</p>
                  <p className="text-gray-700">
                    {cert.issued_date
                      ? new Date(cert.issued_date).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">วันหมดอายุ</p>
                  <p className="text-gray-700">
                    {cert.expiry_date
                      ? new Date(cert.expiry_date).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })
                      : "ไม่มีวันหมดอายุ"}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <DaysLeftBadge days={cert.days_left} />
                <div className="flex items-center gap-2 ml-auto">
                  {cert.can_renew && (
                    <button className="text-xs bg-[#4A1A6B] hover:bg-[#2D0F42] text-white px-3 py-1.5 rounded-lg transition-colors">
                      ต่ออายุใบประกาศ
                    </button>
                  )}
                  <Link
                    href={`/certificate/${cert.id}`}
                    className="text-xs flex items-center gap-1 bg-[#15376D] hover:bg-[#0f2650] text-white px-3 py-1.5 rounded-lg transition-colors"
                  >
                    📥 ดาวน์โหลดใบประกาศ
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
