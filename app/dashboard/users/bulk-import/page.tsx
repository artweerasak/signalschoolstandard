"use client";

import { useState, useCallback, useRef } from "react";

const RANK_MAP: Record<string, string> = {
  PVT: "พลทหาร", CPL: "สิบตรี", SGT3: "สิบโท", SGT2: "สิบเอก",
  SSGT: "จ่าสิบตรี", MSGT: "จ่าสิบโท", CSGT: "จ่าสิบเอก",
  WO1: "พันจ่าตรี", WO2: "พันจ่าโท", WO3: "พันจ่าเอก",
  "2LT": "ร้อยตรี", "1LT": "ร้อยโท", CPT: "ร้อยเอก",
  MAJ: "พันตรี", LTCOL: "พันโท", COL: "พันเอก",
  BGEN: "พลตรี", MGEN: "พลโท", GEN: "พลเอก",
};

type Step = "upload" | "preview" | "done";

interface UserRow {
  username: string;
  full_name_th: string;
  rank: string;
  national_id: string;
  military_id: string;
  unit: string;
  sub_unit?: string;
  birth_date: string;
  service_start_date: string;
  role?: string;
  contact_email?: string;
  phone_number?: string;
  personnel_type?: string;
  gender?: string;
  civilian_prefix?: string;
}

interface PreviewResult {
  total: number;
  preview: UserRow[];
  parse_errors: string[];
}

interface ImportResult {
  created: number;
  skipped: number;
  skipped_list: { username: string; reason: string }[];
  errors: string[];
  total: number;
}

export default function BulkImportUsersPage() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function getCookie(name: string) {
    const v = document.cookie.match("(^|;) ?" + name + "=([^;]*)(;|$)");
    return v ? v[2] : null;
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith(".xlsx") || f.name.endsWith(".xls"))) {
      setFile(f);
      setError("");
    } else {
      setError("รองรับเฉพาะไฟล์ .xlsx หรือ .xls");
    }
  }, []);

  async function handlePreview() {
    if (!file) return setError("กรุณาเลือกไฟล์ก่อน");
    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("dry_run", "true");
      const res = await fetch("/military/api/v1/admin/users/bulk-import/", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRFToken": getCookie("csrftoken") || "" },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ไม่สามารถอ่านไฟล์ได้");
      setPreview(data);
      setStep("preview");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/military/api/v1/admin/users/bulk-import/", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRFToken": getCookie("csrftoken") || "" },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "นำเข้าไม่สำเร็จ");
      setResult(data);
      setStep("done");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-1">👥 นำเข้าผู้ใช้จาก Excel</h1>
      <p className="text-gray-500 text-sm mb-6">
        อัปโหลดไฟล์ Excel เพื่อสร้างบัญชีผู้ใช้ทีละหลายคนพร้อมกัน รองรับสูงสุด 1,000 คนต่อไฟล์
      </p>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8 text-sm">
        {(["upload", "preview", "done"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold
              ${step === s ? "bg-purple-700 text-white" :
                (["upload","preview","done"].indexOf(step) > i ? "bg-green-500 text-white" : "bg-gray-200 text-gray-500")}`}>
              {["upload","preview","done"].indexOf(step) > i ? "✓" : i + 1}
            </div>
            <span className={step === s ? "font-semibold text-purple-700" : "text-gray-400"}>
              {["อัปโหลด", "ตรวจสอบ", "เสร็จสิ้น"][i]}
            </span>
            {i < 2 && <div className="w-8 h-px bg-gray-300" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* ===== STEP 1: UPLOAD ===== */}
      {step === "upload" && (
        <div className="space-y-4">
          {/* Download template */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 flex items-start gap-3">
            <span className="text-2xl">📋</span>
            <div className="flex-1">
              <p className="font-semibold text-purple-800">ดาวน์โหลด Template ก่อน</p>
              <p className="text-sm text-purple-600 mt-0.5">
                กรอกข้อมูลใน Template Excel แล้วนำมาอัปโหลด — รองรับทั้งทหาร, ลูกจ้างประจำ, พนักงานราชการ
              </p>
            </div>
            <a
              href="/military/api/v1/admin/users/bulk-import/template/"
              className="px-4 py-2 bg-purple-700 text-white rounded-lg text-sm hover:bg-purple-800 whitespace-nowrap flex items-center gap-1.5"
            >
              ⬇️ ดาวน์โหลด Template
            </a>
          </div>

          {/* Rank reference */}
          <details className="border rounded-lg">
            <summary className="px-4 py-2 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50">
              📖 รหัสยศที่รองรับ (คลิกเพื่อดู)
            </summary>
            <div className="px-4 pb-3 pt-1 grid grid-cols-3 sm:grid-cols-4 gap-1">
              {Object.entries(RANK_MAP).map(([code, label]) => (
                <div key={code} className="flex gap-2 text-xs py-0.5">
                  <span className="font-mono font-bold text-purple-700 w-12">{code}</span>
                  <span className="text-gray-600">{label}</span>
                </div>
              ))}
            </div>
          </details>

          {/* Dropzone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition
              ${dragging ? "border-purple-500 bg-purple-50" : "border-gray-300 hover:border-purple-400 hover:bg-gray-50"}`}
          >
            <div className="text-4xl mb-3">📊</div>
            {file ? (
              <div>
                <p className="font-semibold text-green-600">{file.name}</p>
                <p className="text-sm text-gray-400">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
            ) : (
              <div>
                <p className="font-medium text-gray-600">ลาก-วาง ไฟล์ Excel ที่นี่</p>
                <p className="text-sm text-gray-400 mt-1">หรือคลิกเพื่อเลือกไฟล์ (.xlsx, .xls)</p>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => { setFile(e.target.files?.[0] || null); setError(""); }}
          />

          <button
            onClick={handlePreview}
            disabled={!file || loading}
            className="w-full py-3 bg-purple-700 text-white rounded-lg font-semibold hover:bg-purple-800 disabled:opacity-50"
          >
            {loading ? "กำลังอ่านไฟล์..." : "ตรวจสอบข้อมูล →"}
          </button>
        </div>
      )}

      {/* ===== STEP 2: PREVIEW ===== */}
      {step === "preview" && preview && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="flex gap-3 flex-wrap">
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex-1 text-center">
              <div className="text-2xl font-bold text-green-700">{preview.total}</div>
              <div className="text-sm text-green-600">ผู้ใช้ที่พบในไฟล์</div>
            </div>
            <div className={`border rounded-lg px-4 py-3 flex-1 text-center ${preview.parse_errors.length > 0 ? "bg-yellow-50 border-yellow-200" : "bg-gray-50 border-gray-200"}`}>
              <div className={`text-2xl font-bold ${preview.parse_errors.length > 0 ? "text-yellow-700" : "text-gray-400"}`}>
                {preview.parse_errors.length}
              </div>
              <div className={`text-sm ${preview.parse_errors.length > 0 ? "text-yellow-600" : "text-gray-400"}`}>
                แถวที่มีปัญหา
              </div>
            </div>
          </div>

          {/* Parse errors */}
          {preview.parse_errors.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="font-semibold text-yellow-800 mb-1 text-sm">⚠️ แถวที่จะถูกข้าม:</p>
              <ul className="text-sm text-yellow-700 space-y-0.5 max-h-32 overflow-y-auto">
                {preview.parse_errors.map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            </div>
          )}

          {/* Preview table */}
          <div>
            <p className="text-sm font-medium text-gray-600 mb-2">
              ตัวอย่าง {preview.preview.length} รายการแรก (จาก {preview.total} รายการ)
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-left font-medium text-gray-500">
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Username</th>
                    <th className="px-3 py-2">ชื่อ-นามสกุล</th>
                    <th className="px-3 py-2">ประเภท/เพศ</th>
                    <th className="px-3 py-2">ยศ/คำนำหน้า</th>
                    <th className="px-3 py-2">หน่วย</th>
                    <th className="px-3 py-2">บทบาท</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.preview.map((u, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2 font-mono text-purple-700">{u.username}</td>
                      <td className="px-3 py-2 font-medium">{u.full_name_th}</td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${
                          u.personnel_type === "civilian" ? "bg-orange-100 text-orange-700" :
                          u.personnel_type === "government" ? "bg-teal-100 text-teal-700" :
                          "bg-indigo-100 text-indigo-700"
                        }`}>
                          {u.personnel_type === "civilian" ? "ลูกจ้าง" :
                           u.personnel_type === "government" ? "พนักงานราชการ" : "ทหาร"}
                        </span>
                        {u.personnel_type === "military" && (
                          <span className="ml-1 text-gray-400">{u.gender === "F" ? "♀หญิง" : "♂ชาย"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {u.personnel_type === "military" ? (
                          <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
                            {RANK_MAP[u.rank] || u.rank || "-"}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                            {u.civilian_prefix || "-"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{u.unit}</td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${u.role === "instructor" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                          {u.role === "instructor" ? "ครูอาจารย์" : "นักเรียน"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.total > 10 && (
              <p className="text-xs text-gray-400 mt-1 text-right">
                + อีก {preview.total - 10} รายการที่จะนำเข้า
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep("upload")} className="flex-1 py-3 border rounded-lg text-gray-600 hover:bg-gray-50 text-sm">
              ← กลับแก้ไขไฟล์
            </button>
            <button
              onClick={handleImport}
              disabled={loading || preview.total === 0}
              className="flex-1 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? "กำลังนำเข้า..." : `✅ นำเข้า ${preview.total} บัญชีผู้ใช้`}
            </button>
          </div>
        </div>
      )}

      {/* ===== STEP 3: DONE ===== */}
      {step === "done" && result && (
        <div className="space-y-4">
          <div className="text-center py-4">
            <div className="text-6xl mb-3">{result.errors.length === 0 ? "🎉" : "⚠️"}</div>
            <h2 className="text-xl font-bold text-green-700">นำเข้าเสร็จสิ้น</h2>
          </div>

          <div className="flex gap-3 justify-center flex-wrap">
            <div className="bg-green-50 border border-green-200 rounded-lg px-6 py-4 text-center">
              <div className="text-3xl font-bold text-green-700">{result.created}</div>
              <div className="text-sm text-green-600">สร้างสำเร็จ</div>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-6 py-4 text-center">
              <div className="text-3xl font-bold text-yellow-700">{result.skipped}</div>
              <div className="text-sm text-yellow-600">ข้ามแล้ว (ซ้ำ)</div>
            </div>
            {result.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-6 py-4 text-center">
                <div className="text-3xl font-bold text-red-700">{result.errors.length}</div>
                <div className="text-sm text-red-600">เกิดข้อผิดพลาด</div>
              </div>
            )}
          </div>

          {result.skipped_list.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="font-semibold text-yellow-800 text-sm mb-1">⚠️ รายการที่ข้าม (มีอยู่แล้ว):</p>
              <ul className="text-sm text-yellow-700 space-y-0.5 max-h-32 overflow-y-auto">
                {result.skipped_list.map((s, i) => (
                  <li key={i}>• {s.username} — {s.reason}</li>
                ))}
              </ul>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="font-semibold text-red-800 text-sm mb-1">❌ ข้อผิดพลาด:</p>
              <ul className="text-sm text-red-700 space-y-0.5 max-h-32 overflow-y-auto">
                {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            </div>
          )}

          <div className="flex gap-3 justify-center pt-2">
            <button
              onClick={() => { setStep("upload"); setFile(null); setPreview(null); setResult(null); setError(""); }}
              className="px-6 py-2 bg-purple-700 text-white rounded-lg hover:bg-purple-800"
            >
              นำเข้าไฟล์ใหม่
            </button>
            <a
              href="/dashboard/users"
              className="px-6 py-2 border rounded-lg text-gray-600 hover:bg-gray-50"
            >
              ดูรายชื่อผู้ใช้ →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
