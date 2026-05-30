"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Library {
  key: string;
  title: string;
  org: string;
  access_level?: string;
}

interface Block {
  usage_key: string;
  display_name: string;
  block_type: string;
  local_key: string;
}

export default function LibraryManagePage() {
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [selectedLib, setSelectedLib] = useState("");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loadingLibs, setLoadingLibs] = useState(true);
  const [loadingBlocks, setLoadingBlocks] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [search, setSearch] = useState("");

  function getCookie(name: string) {
    const v = document.cookie.match("(^|;) ?" + name + "=([^;]*)(;|$)");
    return v ? v[2] : null;
  }

  useEffect(() => {
    fetch("/military/api/v1/import/libraries/", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const libs = d.libraries || [];
        setLibraries(libs);
        if (libs.length > 0) setSelectedLib(libs[0].key);
      })
      .catch(() => setMsg({ type: "error", text: "ไม่สามารถโหลด Library ได้" }))
      .finally(() => setLoadingLibs(false));
  }, []);

  function loadBlocks(libKey?: string) {
    const lib = libKey || selectedLib;
    if (!lib) return;
    setLoadingBlocks(true);
    setBlocks([]);
    setChecked(new Set());
    fetch(`/military/api/v1/import/libraries/${encodeURIComponent(lib)}/blocks/`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.blocks) setBlocks(d.blocks);
        else setMsg({ type: "error", text: d.error || "โหลด blocks ไม่สำเร็จ" });
      })
      .catch(() => setMsg({ type: "error", text: "เชื่อมต่อ API ไม่ได้" }))
      .finally(() => setLoadingBlocks(false));
  }

  useEffect(() => {
    if (!selectedLib) return;
    setMsg(null);
    loadBlocks(selectedLib);
  }, [selectedLib]);

  const filteredBlocks = blocks.filter((b) =>
    search === "" ||
    b.display_name.toLowerCase().includes(search.toLowerCase()) ||
    b.local_key.toLowerCase().includes(search.toLowerCase())
  );

  const allFilteredChecked =
    filteredBlocks.length > 0 &&
    filteredBlocks.every((b) => checked.has(b.usage_key));

  function toggleAll() {
    if (allFilteredChecked) {
      const next = new Set(checked);
      filteredBlocks.forEach((b) => next.delete(b.usage_key));
      setChecked(next);
    } else {
      const next = new Set(checked);
      filteredBlocks.forEach((b) => next.add(b.usage_key));
      setChecked(next);
    }
  }

  function toggleOne(key: string) {
    const next = new Set(checked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setChecked(next);
  }

  async function handleBulkDelete() {
    setDeleting(true);
    setMsg(null);
    try {
      const usageKeys = Array.from(checked);
      const res = await fetch("/military/api/v1/import/blocks/bulk-delete/", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken") || "",
        },
        body: JSON.stringify({ usage_keys: usageKeys }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ลบไม่สำเร็จ");

      const errCount = data.errors?.length || 0;
      setMsg({
        type: errCount > 0 ? "error" : "success",
        text: errCount > 0
          ? `⚠️ ลบสำเร็จ ${data.deleted} ข้อ แต่เกิดข้อผิดพลาด ${errCount} ข้อ`
          : `✅ ลบสำเร็จ ${data.deleted} ข้อ`,
      });
      loadBlocks();
    } catch (e: any) {
      setMsg({ type: "error", text: "❌ " + e.message });
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const selectedLib_title = libraries.find((l) => l.key === selectedLib)?.title || selectedLib;

  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">📚 จัดการคลังข้อสอบ</h1>
          <p className="text-gray-500 text-sm mt-1">ดู แก้ไข และลบข้อสอบในคลังข้อสอบของคุณ</p>
        </div>
        <Link
          href="/instructor/import-questions"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-2"
        >
          📥 นำเข้าข้อสอบ
        </Link>
      </div>

      {/* Library selector */}
      {loadingLibs ? (
        <div className="text-gray-400 text-sm">กำลังโหลด Library...</div>
      ) : libraries.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-4">
          คุณยังไม่มีคลังข้อสอบ{" "}
          <Link href="/instructor/import-questions" className="underline text-blue-600">
            นำเข้าข้อสอบก่อน
          </Link>
        </div>
      ) : (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">เลือกคลังข้อสอบ</label>
          <select
            value={selectedLib}
            onChange={(e) => { setSelectedLib(e.target.value); setSearch(""); }}
            className="border rounded-lg px-3 py-2 text-sm min-w-[280px]"
          >
            {libraries.map((l) => (
              <option key={l.key} value={l.key}>
                {l.title} ({l.org})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Message */}
      {msg && (
        <div
          className={`rounded-lg p-3 mb-4 text-sm ${
            msg.type === "success"
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Blocks table */}
      {selectedLib && (
        <div className="bg-white border rounded-xl shadow-sm">
          {/* Table toolbar */}
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b">
            <div className="flex items-center gap-2 flex-1">
              <span className="text-sm font-medium text-gray-700">
                {loadingBlocks
                  ? "กำลังโหลด..."
                  : `${blocks.length} ข้อ${checked.size > 0 ? ` • เลือก ${checked.size} ข้อ` : ""}`}
              </span>
            </div>
            {/* Search */}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 ค้นหาข้อสอบ..."
              className="border rounded-lg px-3 py-1.5 text-sm w-60"
            />
            {/* Delete button */}
            {checked.size > 0 && (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={deleting}
                className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                🗑️ ลบที่เลือก ({checked.size})
              </button>
            )}
          </div>

          {/* Confirm delete dialog */}
          {confirmDelete && (
            <div className="mx-4 my-3 bg-red-50 border border-red-300 rounded-lg p-4">
              <p className="font-semibold text-red-800 mb-1">⚠️ ยืนยันการลบ</p>
              <p className="text-sm text-red-700 mb-3">
                คุณต้องการลบ <strong>{checked.size} ข้อสอบ</strong> ที่เลือกออกจากคลัง{" "}
                <strong>{selectedLib_title}</strong> ใช่หรือไม่? ไม่สามารถกู้คืนได้
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleBulkDelete}
                  disabled={deleting}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? "กำลังลบ..." : "ยืนยัน ลบ"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          {loadingBlocks ? (
            <div className="p-8 text-center text-gray-400">
              <div className="animate-spin text-3xl mb-2">⏳</div>
              กำลังโหลดข้อสอบ...
            </div>
          ) : filteredBlocks.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              {blocks.length === 0 ? "ไม่มีข้อสอบในคลังนี้" : "ไม่พบข้อสอบที่ค้นหา"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allFilteredChecked}
                        onChange={toggleAll}
                        className="rounded"
                        title="เลือกทั้งหมด"
                      />
                    </th>
                    <th className="px-4 py-3 w-12">#</th>
                    <th className="px-4 py-3">คำถาม / ชื่อข้อสอบ</th>
                    <th className="px-4 py-3 w-24">ประเภท</th>
                    <th className="px-4 py-3 w-32 text-right">รหัส</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredBlocks.map((block, index) => (
                    <tr
                      key={block.usage_key}
                      className={`hover:bg-gray-50 cursor-pointer transition ${
                        checked.has(block.usage_key) ? "bg-red-50" : ""
                      }`}
                      onClick={() => toggleOne(block.usage_key)}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={checked.has(block.usage_key)}
                          onChange={() => toggleOne(block.usage_key)}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-400 font-mono">{index + 1}</td>
                      <td className="px-4 py-3">
                        <span
                          className="font-medium text-gray-800 line-clamp-2"
                          title={block.display_name}
                        >
                          {block.display_name}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
                          {block.block_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400 font-mono text-xs">
                        {block.local_key}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer */}
          {!loadingBlocks && filteredBlocks.length > 0 && (
            <div className="px-4 py-2 border-t text-xs text-gray-400 flex items-center justify-between">
              <span>แสดง {filteredBlocks.length} จาก {blocks.length} ข้อ</span>
              {checked.size > 0 && (
                <button
                  onClick={() => setChecked(new Set())}
                  className="text-blue-500 hover:underline"
                >
                  ยกเลิกการเลือกทั้งหมด
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
