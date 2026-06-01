/**
 * app/my/certificates/page.tsx
 * หน้าใบประกาศของกำลังพล — รวมสถานะรออนุมัติ Batch
 */
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { api, MyCertificate } from "@/lib/api"

const API = "/military/api/v1"

const statusStyles: Record<string, string> = {
  active:  "bg-green-100 text-green-700",
  expired: "bg-red-100 text-red-700",
  renewed: "bg-blue-100 text-blue-700",
  revoked: "bg-gray-100 text-gray-600",
}

function DaysLeftBadge({ days }: { days: number | null }) {
  if (days === null) return null
  if (days < 0)   return <span className="text-red-500 text-xs">หมดอายุไปแล้ว {Math.abs(days)} วัน</span>
  if (days <= 7)  return <span className="text-red-600 font-bold text-xs">⚠️ เหลืออีก {days} วัน!</span>
  if (days <= 30) return <span className="text-yellow-600 text-xs">⚠️ เหลืออีก {days} วัน</span>
  return <span className="text-gray-400 text-xs">เหลืออีก {days} วัน</span>
}

interface BatchStatus {
  batch_id: number
  batch_name: string
  course_id: string
  course_name: string
  approve_date: string
  enrollment_end: string
  days_left_to_end: number
  batch_status: string
  my_status: string
  score: number | null
  cert_uuid: string
  passed_at: string | null
}

function PendingBatchCard({ item }: { item: BatchStatus }) {
  const daysToApprove = Math.ceil(
    (new Date(item.approve_date).getTime() - Date.now()) / 86400000
  )
  const daysToEnd = item.days_left_to_end

  // สีตามสถานะ
  const configs: Record<string, { icon: string; bg: string; border: string; badge: string; badgeText: string; msg: string }> = {
    pending: {
      icon: "⏳", bg: "bg-yellow-50", border: "border-yellow-200",
      badge: "bg-yellow-100 text-yellow-700", badgeText: "รออนุมัติ",
      msg: `ผ่านแล้ว — รอการอนุมัติใบประกาศ รอบ "${item.batch_name}" วันที่ ${item.approve_date}`,
    },
    approved: {
      icon: "✅", bg: "bg-green-50", border: "border-green-200",
      badge: "bg-green-100 text-green-700", badgeText: "อนุมัติแล้ว",
      msg: "ได้รับใบประกาศแล้ว",
    },
    not_passed: {
      icon: "📚", bg: "bg-red-50", border: "border-red-200",
      badge: "bg-red-100 text-red-700", badgeText: "ยังไม่ผ่าน",
      msg: daysToEnd >= 0
        ? `ยังไม่ผ่าน — เหลือเวลา ${daysToEnd} วัน ก่อนปิดรอบ "${item.batch_name}" (${item.enrollment_end})`
        : `หมดเวลารอบ "${item.batch_name}" แล้ว`,
    },
    passed_waiting_scan: {
      icon: "🕐", bg: "bg-blue-50", border: "border-blue-200",
      badge: "bg-blue-100 text-blue-700", badgeText: "ผ่านแล้ว รอสแกน",
      msg: `ผ่านการประเมินแล้ว — รอเจ้าหน้าที่ดึงข้อมูลเข้าระบบ (อนุมัติ ${item.approve_date})`,
    },
    rejected: {
      icon: "❌", bg: "bg-gray-50", border: "border-gray-200",
      badge: "bg-gray-100 text-gray-600", badgeText: "ไม่ผ่าน",
      msg: "ไม่ผ่านเกณฑ์การอนุมัติ",
    },
  }

  const cfg = configs[item.my_status] ?? configs["not_passed"]

  return (
    <div className={`rounded-xl border p-5 ${cfg.bg} ${cfg.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="text-2xl">{cfg.icon}</span>
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-800 truncate">{item.course_name || item.course_id}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{item.batch_name}</p>
            <p className="text-sm text-gray-600 mt-2">{cfg.msg}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${cfg.badge}`}>{cfg.badgeText}</span>
          {item.score != null && (
            <span className="text-xs text-gray-500">คะแนน {item.score}%</span>
          )}
        </div>
      </div>

      {/* Progress info */}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
        {item.my_status === "not_passed" && daysToEnd >= 0 && (
          <span className={`font-medium ${daysToEnd <= 7 ? "text-red-600" : daysToEnd <= 14 ? "text-yellow-600" : "text-gray-500"}`}>
            {daysToEnd <= 7 ? "⚠️ " : ""}เหลือ {daysToEnd} วันก่อนปิดรอบ
          </span>
        )}
        {item.my_status === "pending" && daysToApprove > 0 && (
          <span className="text-yellow-600">อีก {daysToApprove} วัน จะประกาศผล</span>
        )}
        {item.my_status === "approved" && item.cert_uuid && (
          <a
            href={`/certificates/${item.cert_uuid}`}
            target="_blank"
            className="text-blue-600 hover:underline font-medium"
          >
            📄 ดูใบประกาศ →
          </a>
        )}
      </div>
    </div>
  )
}

export default function MyCertificatesPage() {
  const [certs, setCerts] = useState<MyCertificate[]>([])
  const [batchStatuses, setBatchStatuses] = useState<BatchStatus[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.myCertificates().then(res => setCerts(res.results)).catch(() => {}),
      fetch(`${API}/cert/my-status/`, { credentials: "include" })
        .then(r => r.json()).then(d => setBatchStatuses(d.certificates || [])).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  const hasBatchItems = batchStatuses.length > 0

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold text-[#2D0F42]">ใบประกาศของฉัน</h2>
        <p className="text-gray-500 text-sm mt-1">ติดตามสถานะใบประกาศและรอบการอนุมัติ</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-5 border border-gray-100 animate-pulse h-24" />
          ))}
        </div>
      ) : (
        <>
          {/* ── รอบการอนุมัติ ── */}
          {hasBatchItems && (
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-600 text-sm uppercase tracking-wider">สถานะรอบการอนุมัติ</h3>
              {batchStatuses.map(item => (
                <PendingBatchCard key={`${item.batch_id}-${item.course_id}`} item={item} />
              ))}
            </div>
          )}

          {/* ── ใบประกาศที่ได้รับแล้ว ── */}
          {certs.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-600 text-sm uppercase tracking-wider">ใบประกาศที่ได้รับแล้ว</h3>
              {certs.map(cert => (
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
                        {cert.issued_date ? new Date(cert.issued_date).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" }) : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">วันหมดอายุ</p>
                      <p className="text-gray-700">
                        {cert.expiry_date ? new Date(cert.expiry_date).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" }) : "ไม่มีวันหมดอายุ"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <DaysLeftBadge days={cert.days_left} />
                    <div className="flex gap-2 ml-auto">
                      {cert.can_renew && (
                        <button className="text-xs bg-[#4A1A6B] hover:bg-[#2D0F42] text-white px-3 py-1.5 rounded-lg">
                          ต่ออายุ
                        </button>
                      )}
                      <a href={`/military/api/v1/my/certificates/${cert.id}/download/`}
                        target="_blank" rel="noreferrer"
                        className="text-xs bg-[#15376D] hover:bg-[#0f2650] text-white px-3 py-1.5 rounded-lg flex items-center gap-1">
                        📥 ดาวน์โหลด PDF
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!hasBatchItems && certs.length === 0 && (
            <div className="bg-white rounded-xl p-10 text-center border border-gray-100">
              <p className="text-4xl mb-3">📜</p>
              <p className="text-gray-500">ยังไม่มีใบประกาศหรือรอบที่เกี่ยวข้อง</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
