"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

interface Library {
  key: string;
  title: string;
  org: string;
}

interface Choice {
  letter: string;
  text: string;
}

interface Question {
  question: string;
  choices: Choice[];
  answer: string;
}

interface ParseResult {
  total: number;
  questions: Question[];
  errors: string[];
}

type Step = "upload" | "preview" | "done";

export default function ImportQuestionsPage() {
  const [step, setStep] = useState<Step>("upload");
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [selectedLib, setSelectedLib] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const LETTER_MAP: Record<string, string> = {
    A: "ก", B: "ข", C: "ค", D: "ง", E: "จ",
  };

  async function loadLibraries() {
    try {
      const res = await fetch("/military/api/v1/import/libraries/", {
        credentials: "include",
      });
      const data = await res.json();
      if (data.libraries) {
        setLibraries(data.libraries);
        if (data.libraries.length > 0) setSelectedLib(data.libraries[0].key);
      }
    } catch {
      setError("ไม่สามารถโหลดรายชื่อ Library ได้");
    }
  }

  // Load libraries on first render
  useState(() => { loadLibraries(); });

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith(".docx")) setFile(f);
    else setError("รองรับเฉพาะไฟล์ .docx");
  }, []);

  async function handleParse() {
    if (!file) return setError("กรุณาเลือกไฟล์ก่อน");
    if (!selectedLib) return setError("กรุณาเลือก Library ก่อน");
    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/military/api/v1/import/parse/", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRFToken": getCookie("csrftoken") || "" },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Parse ไม่สำเร็จ");
      setParseResult(data);
      setStep("preview");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!file || !selectedLib) return;
    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("library_key", selectedLib);
      const res = await fetch("/military/api/v1/import/execute/", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRFToken": getCookie("csrftoken") || "" },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import ไม่สำเร็จ");
      setImportResult(data);
      setStep("done");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function getCookie(name: string) {
    const v = document.cookie.match("(^|;) ?" + name + "=([^;]*)(;|$)");
    return v ? v[2] : null;
  }

  const selectedLibTitle = libraries.find((l) => l.key === selectedLib)?.title || selectedLib;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">📥 นำเข้าข้อสอบจาก Word</h1>
      <p className="text-gray-500 mb-6">
        อัปโหลดไฟล์ .docx แล้วระบบจะ parse ข้อสอบอัตโนมัติ และนำเข้าสู่คลังข้อสอบ
      </p>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8 text-sm">
        {(["upload", "preview", "done"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold
              ${step === s ? "bg-blue-600 text-white" : 
                (["upload","preview","done"].indexOf(step) > i ? "bg-green-500 text-white" : "bg-gray-200 text-gray-500")}`}>
              {["upload","preview","done"].indexOf(step) > i ? "✓" : i + 1}
            </div>
            <span className={step === s ? "font-semibold text-blue-600" : "text-gray-400"}>
              {["อัปโหลด", "ตรวจสอบ", "เสร็จสิ้น"][i]}
            </span>
            {i < 2 && <div className="w-8 h-px bg-gray-300" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      {/* ===== STEP 1: UPLOAD ===== */}
      {step === "upload" && (
        <div className="space-y-4">
          {/* Library selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              เลือกคลังข้อสอบ (Library) ปลายทาง
            </label>
            {libraries.length === 0 ? (
              <p className="text-sm text-gray-400">กำลังโหลด...</p>
            ) : (
              <select
                value={selectedLib}
                onChange={(e) => setSelectedLib(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                {libraries.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.title} ({l.org})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Dropzone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition
              ${dragging ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"}`}
          >
            <div className="text-4xl mb-3">📄</div>
            {file ? (
              <div>
                <p className="font-semibold text-green-600">{file.name}</p>
                <p className="text-sm text-gray-400">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
            ) : (
              <div>
                <p className="font-medium text-gray-600">ลาก-วาง ไฟล์ .docx ที่นี่</p>
                <p className="text-sm text-gray-400 mt-1">หรือคลิกเพื่อเลือกไฟล์</p>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".docx"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />

          {/* Format guide */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
            <p className="font-semibold text-blue-800 mb-2">📋 รูปแบบข้อสอบใน Word</p>
            <pre className="text-blue-700 whitespace-pre-wrap font-mono text-xs leading-relaxed">
{`ข้อ 1 อาวุธประจำกายของทหารสื่อสารคืออะไร
ก. ปืนเล็กยาว
ข. ปืนพก
ค. ระเบิดมือ
ง. มีดปลายปืน
เฉลย ข

ข้อ 2 ...`}
            </pre>
            <p className="text-blue-600 mt-2 text-xs">
              รองรับ: ก/A ข/B ค/C ง/D • เฉลย/ตอบ/ANSWER • มี/ไม่มีเลขข้อนำก็ได้
            </p>
          </div>

          <button
            onClick={handleParse}
            disabled={!file || !selectedLib || loading}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "กำลัง Parse..." : "ตรวจสอบข้อสอบ →"}
          </button>
        </div>
      )}

      {/* ===== STEP 2: PREVIEW ===== */}
      {step === "preview" && parseResult && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex gap-3 flex-wrap">
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex-1 text-center">
              <div className="text-2xl font-bold text-green-700">{parseResult.total}</div>
              <div className="text-sm text-green-600">ข้อสอบที่พบ</div>
            </div>
            <div className={`border rounded-lg px-4 py-3 flex-1 text-center ${parseResult.errors.length > 0 ? "bg-yellow-50 border-yellow-200" : "bg-gray-50 border-gray-200"}`}>
              <div className={`text-2xl font-bold ${parseResult.errors.length > 0 ? "text-yellow-700" : "text-gray-400"}`}>{parseResult.errors.length}</div>
              <div className={`text-sm ${parseResult.errors.length > 0 ? "text-yellow-600" : "text-gray-400"}`}>ข้อที่มีปัญหา</div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex-1 text-center">
              <div className="text-sm font-medium text-blue-700 break-all">{selectedLibTitle}</div>
              <div className="text-xs text-blue-500">Library ปลายทาง</div>
            </div>
          </div>

          {/* Errors */}
          {parseResult.errors.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="font-semibold text-yellow-800 mb-1">⚠️ ข้อที่ parse ไม่สำเร็จ (จะถูกข้าม):</p>
              <ul className="text-sm text-yellow-700 space-y-1">
                {parseResult.errors.map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            </div>
          )}

          {/* Preview questions */}
          <div>
            <p className="text-sm font-medium text-gray-600 mb-2">
              ตัวอย่างข้อสอบ (แสดง {parseResult.questions.length} ข้อแรก
              {parseResult.total > 20 ? ` จาก ${parseResult.total} ข้อ` : ""})
            </p>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {parseResult.questions.map((q, i) => (
                <div key={i} className="border rounded-lg p-3 bg-white">
                  <p className="font-medium text-sm mb-2">ข้อ {i + 1}: {q.question}</p>
                  <div className="grid grid-cols-2 gap-1">
                    {q.choices.map((c) => (
                      <div key={c.letter} className={`text-xs px-2 py-1 rounded flex items-center gap-1
                        ${c.letter === q.answer ? "bg-green-100 text-green-700 font-semibold" : "bg-gray-50 text-gray-600"}`}>
                        <span>{LETTER_MAP[c.letter] || c.letter}.</span>
                        <span>{c.text}</span>
                        {c.letter === q.answer && <span className="ml-auto">✓</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep("upload")} className="flex-1 py-3 border rounded-lg text-gray-600 hover:bg-gray-50">
              ← กลับแก้ไขไฟล์
            </button>
            <button
              onClick={handleImport}
              disabled={loading || parseResult.total === 0}
              className="flex-2 flex-1 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? "กำลัง Import..." : `นำเข้า ${parseResult.total} ข้อ →`}
            </button>
          </div>
        </div>
      )}

      {/* ===== STEP 3: DONE ===== */}
      {step === "done" && importResult && (
        <div className="text-center space-y-4">
          <div className="text-6xl">🎉</div>
          <h2 className="text-xl font-bold text-green-700">นำเข้าสำเร็จ!</h2>
          <div className="flex gap-3 justify-center flex-wrap">
            <div className="bg-green-50 border border-green-200 rounded-lg px-6 py-4">
              <div className="text-3xl font-bold text-green-700">{importResult.imported}</div>
              <div className="text-sm text-green-600">ข้อที่นำเข้าสำเร็จ</div>
            </div>
            {importResult.import_errors?.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-6 py-4">
                <div className="text-3xl font-bold text-red-700">{importResult.import_errors.length}</div>
                <div className="text-sm text-red-600">ข้อที่เกิดข้อผิดพลาด</div>
              </div>
            )}
          </div>
          <p className="text-gray-500 text-sm">
            นำเข้าเข้า Library: <strong>{selectedLibTitle}</strong>
          </p>
          {importResult.import_errors?.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-left text-sm">
              {importResult.import_errors.map((e: string, i: number) => <p key={i} className="text-red-600">• {e}</p>)}
            </div>
          )}
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => { setStep("upload"); setFile(null); setParseResult(null); setImportResult(null); setError(""); }}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              นำเข้าไฟล์ใหม่
            </button>
            <a
              href={`https://studio-signalstandard.rta.mi.th`}
              target="_blank"
              rel="noreferrer"
              className="px-6 py-2 border rounded-lg text-gray-600 hover:bg-gray-50"
            >
              ไปที่ Studio →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
