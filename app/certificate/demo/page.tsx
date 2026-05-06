/**
 * app/certificate/demo/page.tsx
 * MOCKUP: ตัวอย่างใบประกาศ — ลบหรือเชื่อมต่อ API จริงหลังนำเสนอ
 */
"use client"

import { useRef } from "react"

// ── ข้อมูลตัวอย่าง (MOCK) ────────────────────────────────────────
const MOCK = {
  certNo:      "สส.2567-0042",
  rank:        "ร้อยตรี",
  firstName:   "สมชาย",
  lastName:    "ใจดี",
  position:    "นายทหารสื่อสาร",
  unit:        "กองพันทหารสื่อสารที่ ๑",
  courseName:  "หลักสูตรคอมพิวเตอร์เบื้องต้นสำหรับกำลังพล",
  courseHours: "30",
  startDate:   "๑ เมษายน ๒๕๖๘",
  endDate:     "๓๐ เมษายน ๒๕๖๘",
  issuedDate:  "๑ พฤษภาคม ๒๕๖๘",
  issuedBy:    "พลตรี วิชัย มั่นคง",
  issuedByPosition: "ผู้บัญชาการโรงเรียนทหารสื่อสาร",
  grade:       "ดีเยี่ยม",
  score:       "92",
}
// ─────────────────────────────────────────────────────────────────

export default function CertificateDemoPage() {
  const printRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      {/* ปุ่มควบคุม — ซ่อนตอนพิมพ์ */}
      <div className="max-w-4xl mx-auto mb-6 flex gap-3 print:hidden">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 bg-[#15376D] hover:bg-[#0f2650] text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow"
        >
          🖨️ พิมพ์ / บันทึก PDF
        </button>
        <span className="text-sm text-gray-500 self-center">
          ⚠️ นี่คือใบประกาศตัวอย่างสำหรับสาธิต
        </span>
      </div>

      {/* ใบประกาศ */}
      <div
        ref={printRef}
        className="max-w-4xl mx-auto bg-white shadow-2xl print:shadow-none"
        style={{ aspectRatio: "1.414 / 1", position: "relative", overflow: "hidden" }}
      >
        {/* กรอบชั้นนอก */}
        <div className="absolute inset-2 border-4 border-[#15376D]" />
        <div className="absolute inset-3 border border-[#C9A84C]" />

        {/* พื้นหลัง watermark */}
        <div
          className="absolute inset-0 flex items-center justify-center opacity-[0.04] pointer-events-none select-none"
          style={{ fontSize: "20rem", fontWeight: 900, color: "#15376D", lineHeight: 1 }}
        >
          ส
        </div>

        {/* เนื้อหาใบประกาศ */}
        <div className="relative z-10 flex flex-col items-center justify-between h-full px-16 py-10 text-center">

          {/* ส่วนหัว */}
          <div className="flex flex-col items-center gap-2">
            {/* โลโก้ + ชื่อหน่วย */}
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/signal_logo.png"
                alt="โรงเรียนทหารสื่อสาร"
                className="h-16 w-16 object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
              />
              <div className="text-left">
                <p className="text-[#15376D] font-bold text-base leading-tight">โรงเรียนทหารสื่อสาร</p>
                <p className="text-[#8B6914] text-xs">กรมทหารสื่อสาร กองทัพบก</p>
              </div>
            </div>

            {/* หัวเรื่อง */}
            <div className="mt-3">
              <h1
                className="font-bold text-[#15376D]"
                style={{ fontSize: "2.2rem", letterSpacing: "0.08em", lineHeight: 1.2 }}
              >
                ประกาศนียบัตร
              </h1>
              <p className="text-[#8B6914] text-sm tracking-widest mt-1">CERTIFICATE OF COMPLETION</p>
              <div className="w-32 h-0.5 bg-[#C9A84C] mx-auto mt-2" />
            </div>
          </div>

          {/* ส่วนกลาง — ชื่อผู้รับ */}
          <div className="flex flex-col items-center gap-3 flex-1 justify-center">
            <p className="text-gray-500 text-sm">ขอมอบประกาศนียบัตรแก่</p>

            <div className="text-center">
              <p
                className="font-bold text-[#15376D]"
                style={{ fontSize: "2rem", lineHeight: 1.3 }}
              >
                {MOCK.rank} {MOCK.firstName} {MOCK.lastName}
              </p>
              <p className="text-gray-500 text-sm mt-1">
                {MOCK.position} &nbsp;|&nbsp; {MOCK.unit}
              </p>
            </div>

            <p className="text-gray-600 text-sm mt-1">
              ได้ผ่านการอบรมหลักสูตร
            </p>

            {/* ชื่อหลักสูตร */}
            <div
              className="px-8 py-3 border-2 border-[#C9A84C] rounded-lg text-center"
              style={{ background: "linear-gradient(135deg, #fffdf5 0%, #fef9e8 100%)" }}
            >
              <p className="font-bold text-[#2D4A1E] text-lg leading-tight">{MOCK.courseName}</p>
              <p className="text-gray-500 text-xs mt-1">จำนวน {MOCK.courseHours} ชั่วโมง</p>
            </div>

            {/* ผลการเรียน */}
            <div className="flex items-center gap-6 mt-1">
              <div className="text-center">
                <p className="text-xs text-gray-400">คะแนน</p>
                <p className="text-2xl font-bold text-[#15376D]">{MOCK.score}</p>
                <p className="text-xs text-gray-400">คะแนน</p>
              </div>
              <div className="w-px h-10 bg-gray-200" />
              <div className="text-center">
                <p className="text-xs text-gray-400">ระดับ</p>
                <p className="text-lg font-bold text-[#C9A84C]">{MOCK.grade}</p>
              </div>
              <div className="w-px h-10 bg-gray-200" />
              <div className="text-center">
                <p className="text-xs text-gray-400">ระยะเวลา</p>
                <p className="text-xs font-medium text-gray-600">{MOCK.startDate}</p>
                <p className="text-xs text-gray-400">ถึง</p>
                <p className="text-xs font-medium text-gray-600">{MOCK.endDate}</p>
              </div>
            </div>
          </div>

          {/* ส่วนล่าง — ลายเซ็น */}
          <div className="w-full flex items-end justify-between">
            {/* QR / เลขที่ */}
            <div className="text-left">
              {/* QR mockup */}
              <div
                className="w-16 h-16 border-2 border-gray-300 rounded flex items-center justify-center text-gray-300 text-xs text-center"
                style={{ background: "#f9f9f9" }}
              >
                <div>
                  <div className="text-2xl">▦</div>
                  <div style={{ fontSize: "0.5rem" }}>QR</div>
                </div>
              </div>
              <p className="text-gray-400 text-xs mt-1">เลขที่ {MOCK.certNo}</p>
              <p className="text-gray-400 text-xs">ออก ณ วันที่ {MOCK.issuedDate}</p>
            </div>

            {/* ลายเซ็น */}
            <div className="text-center">
              <div className="w-40 border-b border-gray-400 mb-1 mx-auto" style={{ marginBottom: "4px" }} />
              <p className="font-semibold text-[#15376D] text-sm">{MOCK.issuedBy}</p>
              <p className="text-gray-500 text-xs">{MOCK.issuedByPosition}</p>
            </div>
          </div>

        </div>

        {/* มุมประดับ */}
        {[
          "top-4 left-4",
          "top-4 right-4 rotate-90",
          "bottom-4 left-4 -rotate-90",
          "bottom-4 right-4 rotate-180",
        ].map((pos, i) => (
          <div key={i} className={`absolute ${pos} w-8 h-8 pointer-events-none`}>
            <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 30 L2 2 L30 2" stroke="#C9A84C" strokeWidth="2" fill="none"/>
            </svg>
          </div>
        ))}
      </div>

      {/* CSS พิมพ์ */}
      <style jsx global>{`
        @media print {
          body { margin: 0; background: white; }
          .print\\:hidden { display: none !important; }
          .print\\:shadow-none { box-shadow: none !important; }
        }
      `}</style>
    </div>
  )
}
