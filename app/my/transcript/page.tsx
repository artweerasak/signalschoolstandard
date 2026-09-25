/**
 * app/my/transcript/page.tsx
 * ระเบียนประวัติการเรียน — ทุก role เข้าถึงได้ (self only)
 */
"use client"

import { useEffect, useState } from "react"
import { api, MyTranscript } from "@/lib/api"

const GATE_REASON_LABEL: Record<string, string> = {
  pending_course_evaluation: "รอทำแบบประเมินรายวิชา",
  pending_curriculum_evaluation: "รอทำแบบประเมินหลักสูตรรวม",
}

export default function MyTranscriptPage() {
  const [data, setData] = useState<MyTranscript | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [downloadMsg, setDownloadMsg] = useState<Record<number, string>>({})

  useEffect(() => {
    api.getMyTranscript()
      .then(setData)
      .catch(() => setError("ไม่สามารถโหลดข้อมูลได้"))
      .finally(() => setLoading(false))
  }, [])

  const handleDownload = async (curriculumId: number) => {
    try {
      const r = await api.checkCertificateAvailable(curriculumId)
      setDownloadMsg({ ...downloadMsg, [curriculumId]: r.available ? "ใบประกาศพร้อมดาวน์โหลด (ระบบสร้างไฟล์จะเปิดให้ใช้งานเร็วๆ นี้)" : (r.reason || "ยังไม่พร้อม") })
    } catch {
      setDownloadMsg({ ...downloadMsg, [curriculumId]: "ยังไม่พร้อมดาวน์โหลด — กรุณาทำแบบประเมินให้ครบก่อน" })
    }
  }

  if (loading) return <div className="p-6 text-center text-[#9a92a8]">กำลังโหลด...</div>
  if (error) return <div className="p-6"><div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div></div>
  if (!data) return null

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#4A1A6B]">ระเบียนประวัติการเรียน</h1>
        <p className="text-sm text-[#6b6478] mt-1">หน่วยกิตสะสมทั้งหมด: <strong>{data.total_credits_earned}</strong> หน่วยกิต</p>
      </div>

      {data.curricula.length === 0 ? (
        <div className="bg-white rounded-xl border shadow-sm py-16 text-center text-[#9a92a8]">
          ยังไม่มีประวัติการเรียนในหลักสูตรใด
        </div>
      ) : (
        data.curricula.map(entry => (
          <div key={entry.curriculum_id} className="bg-white rounded-xl shadow-sm border border-[#f0ecf6] overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <p className="font-semibold text-[#2D0F42]">{entry.curriculum_name}</p>
                <p className="text-xs text-[#6b6478]">รุ่น {entry.batch_code} / {entry.academic_year}</p>
              </div>
              {entry.certificate_available ? (
                <button onClick={() => handleDownload(entry.curriculum_id)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
                  🎓 ดาวน์โหลดใบประกาศ
                </button>
              ) : (
                <span className="text-xs text-yellow-700 bg-yellow-100 px-3 py-1.5 rounded-full">
                  {GATE_REASON_LABEL[entry.gate_reason || ""] || "หลักสูตรยังไม่เสร็จสมบูรณ์"}
                </span>
              )}
            </div>
            {downloadMsg[entry.curriculum_id] && (
              <div className="px-4 py-2 bg-blue-50 text-blue-700 text-xs">{downloadMsg[entry.curriculum_id]}</div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e6e1ee] bg-[#f7f5fa] text-left text-xs text-[#6b6478] uppercase">
                  <th className="px-4 py-3">วิชา</th>
                  <th className="px-4 py-3">หน่วยกิต</th>
                  <th className="px-4 py-3">คะแนน</th>
                  <th className="px-4 py-3">ผล</th>
                </tr>
              </thead>
              <tbody>
                {entry.courses.map(c => (
                  <tr key={c.course_id} className="border-b border-[#f0ecf6]">
                    <td className="px-4 py-3">{c.display_name}</td>
                    <td className="px-4 py-3 text-[#6b6478]">{c.credits}</td>
                    <td className="px-4 py-3 text-[#6b6478]">
                      {c.grade_visible ? (c.final_score ?? "-") : (
                        <span className="text-xs text-yellow-700">{GATE_REASON_LABEL[c.gate_reason || ""] || "รอประเมิน"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {!c.grade_visible ? (
                        <span className="text-[#9a92a8] text-xs">-</span>
                      ) : c.passed === null ? (
                        <span className="text-[#9a92a8] text-xs">ยังไม่ตัดสิน</span>
                      ) : (
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                          c.passed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                        }`}>
                          {c.passed ? "ผ่าน" : "ไม่ผ่าน"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  )
}
