/**
 * app/certificate/[id]/page.tsx
 * หน้าแสดงใบประกาศจริงพร้อม Print/Download PDF
 */
"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { api, CertificateDetail } from "@/lib/api"

function formatThaiDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })
}

export default function CertificatePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [cert, setCert] = useState<CertificateDetail | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.myCertificateDetail(Number(id))
      .then(setCert)
      .catch(() => setError("ไม่พบใบประกาศ หรือท่านไม่มีสิทธิ์เข้าถึง"))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-gray-400 text-lg">กำลังโหลดใบประกาศ...</div>
    </div>
  )

  if (error || !cert) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <p className="text-4xl mb-3">📜</p>
        <p className="text-gray-600">{error || "ไม่พบข้อมูล"}</p>
        <button onClick={() => router.back()} className="mt-4 text-[#15376D] underline text-sm">
          ← กลับ
        </button>
      </div>
    </div>
  )

  // คำนวณชั่วโมงเรียนจาก validity
  const issuedYear = cert.issued_date ? new Date(cert.issued_date).getFullYear() + 543 : ""

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      {/* ปุ่มควบคุม */}
      <div className="max-w-4xl mx-auto mb-6 flex items-center gap-3 print:hidden">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-gray-500 hover:text-gray-800 text-sm transition-colors"
        >
          ← กลับ
        </button>
        <div className="flex-1" />
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-[#15376D] hover:bg-[#0f2650] text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow"
        >
          🖨️ พิมพ์ / บันทึก PDF
        </button>
      </div>

      {/* ใบประกาศ */}
      <div
        className="max-w-4xl mx-auto bg-white shadow-2xl print:shadow-none relative overflow-hidden"
        style={{ minHeight: "580px" }}
      >
        {/* กรอบชั้นนอก */}
        <div className="absolute inset-2 border-4 border-[#15376D] pointer-events-none z-20" />
        <div className="absolute inset-3 border border-[#C9A84C] pointer-events-none z-20" />

        {/* watermark */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0"
          style={{ fontSize: "18rem", fontWeight: 900, color: "#15376D", opacity: 0.03, lineHeight: 1 }}
        >ส</div>

        {/* เนื้อหา */}
        <div className="relative z-10 flex flex-col items-center px-16 py-10 gap-6">

          {/* หัว */}
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/signal_logo.png"
                alt="โรงเรียนทหารสื่อสาร"
                className="h-14 w-14 object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display="none" }}
              />
              <div className="text-left">
                <p className="text-[#15376D] font-bold text-base">โรงเรียนทหารสื่อสาร</p>
                <p className="text-[#8B6914] text-xs">กรมทหารสื่อสาร กองทัพบก</p>
              </div>
            </div>
            <h1 className="font-bold text-[#15376D] mt-2" style={{ fontSize: "2rem", letterSpacing: "0.1em" }}>
              ประกาศนียบัตร
            </h1>
            <p className="text-[#8B6914] text-xs tracking-widest">CERTIFICATE OF COMPLETION</p>
            <div className="w-24 h-0.5 bg-[#C9A84C] mt-1" />
          </div>

          {/* ชื่อผู้รับ */}
          <div className="text-center">
            <p className="text-gray-500 text-sm mb-2">ขอมอบประกาศนียบัตรแก่</p>
            <p className="font-bold text-[#15376D]" style={{ fontSize: "1.8rem" }}>
              {cert.rank} {cert.full_name}
            </p>
            {cert.unit && (
              <p className="text-gray-500 text-sm mt-1">{cert.unit}{cert.sub_unit ? ` · ${cert.sub_unit}` : ""}</p>
            )}
          </div>

          {/* หลักสูตร */}
          <div className="text-center">
            <p className="text-gray-600 text-sm mb-2">ได้ผ่านการอบรมหลักสูตร</p>
            <div
              className="px-8 py-4 border-2 border-[#C9A84C] rounded-lg inline-block"
              style={{ background: "linear-gradient(135deg, #fffdf5, #fef9e8)" }}
            >
              <p className="font-bold text-[#2D4A1E] text-lg">{cert.course_name}</p>
            </div>
          </div>

          {/* วันที่ */}
          <div className="flex items-center gap-8 text-center">
            <div>
              <p className="text-xs text-gray-400 mb-1">วันที่ออกใบประกาศ</p>
              <p className="font-medium text-gray-700">{formatThaiDate(cert.issued_date)}</p>
            </div>
            <div className="w-px h-10 bg-gray-200" />
            <div>
              <p className="text-xs text-gray-400 mb-1">วันหมดอายุ</p>
              <p className="font-medium text-gray-700">{formatThaiDate(cert.expiry_date)}</p>
            </div>
          </div>

          {/* ส่วนล่าง: เลขที่ + ลายเซ็น */}
          <div className="w-full flex items-end justify-between pt-4 border-t border-gray-100 mt-2">
            <div className="text-left">
              <div
                className="w-16 h-16 border-2 border-gray-200 rounded flex items-center justify-center text-gray-200 text-3xl"
                style={{ background: "#f9f9f9" }}
              >▦</div>
              <p className="text-gray-400 text-xs mt-1">เลขที่ {cert.cert_no}</p>
            </div>
            <div className="text-center">
              <div className="w-44 border-b border-gray-400 mb-1 mx-auto" />
              <p className="font-semibold text-[#15376D] text-sm">พลตรี วิชัย มั่นคง</p>
              <p className="text-gray-500 text-xs">ผู้บัญชาการโรงเรียนทหารสื่อสาร</p>
            </div>
          </div>

        </div>

        {/* มุมประดับ */}
        {(["top-4 left-4","top-4 right-4 rotate-90","bottom-4 left-4 -rotate-90","bottom-4 right-4 rotate-180"] as const).map((pos, i) => (
          <div key={i} className={`absolute ${pos} w-8 h-8 pointer-events-none z-20`}>
            <svg viewBox="0 0 32 32" fill="none"><path d="M2 30 L2 2 L30 2" stroke="#C9A84C" strokeWidth="2"/></svg>
          </div>
        ))}
      </div>

      <style jsx global>{`
        @media print {
          body { margin: 0; background: white; }
          .print\\:hidden { display: none !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          @page { size: A4 landscape; margin: 0; }
        }
      `}</style>
    </div>
  )
}
