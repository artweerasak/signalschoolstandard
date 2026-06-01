'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

interface Subject { name: string; file_count: number; }
interface VideoFile {
  name: string; size: number; url: string; modified: number;
  course_slug: string; uploader: string;
}
interface UploadItem {
  id: string; file: File; progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string; url?: string;
}

function formatSize(b: number) {
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1024 ** 3) return (b / 1024 / 1024).toFixed(1) + ' MB';
  return (b / 1024 ** 3).toFixed(2) + ' GB';
}
function getCookie(name: string) {
  const v = document.cookie.match('(^|;) ?' + name + '=([^;]*)(;|$)');
  return v ? v[2] : null;
}

export default function VideosPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [creatingSubject, setCreatingSubject] = useState(false);
  const [filterSubject, setFilterSubject] = useState('');
  const [files, setFiles] = useState<VideoFile[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const csrf = getCookie('csrftoken') || '';

  const isUploading = uploadQueue.some(u => u.status === 'uploading' || u.status === 'pending');

  const loadSubjects = useCallback(async () => {
    setLoadingSubjects(true);
    try {
      const res = await fetch('/military/api/v1/videos/subjects/', { credentials: 'include' });
      const data = await res.json();
      const list: Subject[] = data.subjects || [];
      setSubjects(list);
      if (list.length > 0 && !selectedSubject) setSelectedSubject(list[0].name);
    } catch { setError('ไม่สามารถโหลดหมวดหมู่ได้'); }
    finally { setLoadingSubjects(false); }
  }, []);

  const loadFiles = useCallback(async (subject = '') => {
    setLoadingFiles(true);
    try {
      const qs = subject ? `?course_slug=${encodeURIComponent(subject)}` : '';
      const res = await fetch(`/military/api/v1/videos/${qs}`, { credentials: 'include' });
      const data = await res.json();
      setFiles(data.files || []);
    } catch { setError('ไม่สามารถโหลดรายการไฟล์ได้'); }
    finally { setLoadingFiles(false); }
  }, []);

  useEffect(() => { loadSubjects(); }, [loadSubjects]);
  useEffect(() => { loadFiles(filterSubject); }, [filterSubject, loadFiles]);

  // อัปโหลดไฟล์เดียวผ่าน XHR พร้อม progress
  const uploadSingle = useCallback((item: UploadItem, subject: string): Promise<void> => {
    return new Promise(resolve => {
      setUploadQueue(q => q.map(u => u.id === item.id ? { ...u, status: 'uploading' } : u));

      const form = new FormData();
      form.append('file', item.file);
      form.append('course_slug', subject);

      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable) {
          const pct = Math.round(e.loaded / e.total * 100);
          setUploadQueue(q => q.map(u => u.id === item.id ? { ...u, progress: pct } : u));
        }
      });
      xhr.addEventListener('load', () => {
        try {
          const result = JSON.parse(xhr.responseText);
          if (xhr.status === 200 && result.success) {
            setUploadQueue(q => q.map(u => u.id === item.id
              ? { ...u, status: 'done', progress: 100, url: result.url } : u));
          } else {
            setUploadQueue(q => q.map(u => u.id === item.id
              ? { ...u, status: 'error', error: result.error || 'อัปโหลดไม่สำเร็จ' } : u));
          }
        } catch {
          setUploadQueue(q => q.map(u => u.id === item.id
            ? { ...u, status: 'error', error: 'Parse error' } : u));
        }
        resolve();
      });
      xhr.addEventListener('error', () => {
        setUploadQueue(q => q.map(u => u.id === item.id
          ? { ...u, status: 'error', error: 'Connection error' } : u));
        resolve();
      });
      xhr.open('POST', '/military/api/v1/videos/upload/');
      xhr.setRequestHeader('X-CSRFToken', csrf);
      xhr.withCredentials = true;
      xhr.send(form);
    });
  }, [csrf]);

  // เพิ่มไฟล์เข้า queue และเริ่ม upload ทีละ 2 ไฟล์พร้อมกัน
  const addFiles = useCallback(async (newFiles: File[]) => {
    if (!selectedSubject) { setError('กรุณาเลือกหมวดหมู่ก่อนอัปโหลด'); return; }
    setError(''); setMsg('');

    const items: UploadItem[] = newFiles.map(f => ({
      id: Math.random().toString(36).slice(2),
      file: f, progress: 0, status: 'pending',
    }));
    setUploadQueue(q => [...q, ...items]);

    // upload ทีละไฟล์ (sequential) เหมือน YouTube — ลดภาระ worker
    for (const item of items) {
      await uploadSingle(item, selectedSubject);
    }
    await loadFiles(filterSubject);
    await loadSubjects();
  }, [selectedSubject, uploadSingle, loadFiles, loadSubjects, filterSubject]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/') || f.name.match(/\.(mp4|mov|avi|mkv|webm|flv|wmv)$/i));
    if (dropped.length > 0) addFiles(dropped);
    else setError('กรุณาเลือกไฟล์วิดีโอเท่านั้น');
  }, [addFiles]);

  const createSubject = async () => {
    const name = newSubjectName.trim();
    if (!name) return;
    setCreatingSubject(true); setError(''); setMsg('');
    try {
      const res = await fetch('/military/api/v1/videos/subjects/', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'สร้างไม่สำเร็จ');
      setMsg(`สร้างหมวดหมู่ "${data.name}" สำเร็จ`);
      setNewSubjectName('');
      await loadSubjects();
      setSelectedSubject(data.name);
    } catch (e: any) { setError(e.message); }
    finally { setCreatingSubject(false); }
  };

  const deleteSubject = async (name: string) => {
    if (!confirm(`ลบหมวดหมู่ "${name}" และวิดีโอทั้งหมดในนั้น ใช่ไหม?`)) return;
    setError(''); setMsg('');
    try {
      const res = await fetch('/military/api/v1/videos/subjects/', {
        method: 'DELETE', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'ลบไม่สำเร็จ');
      setMsg(`ลบหมวดหมู่ "${name}" สำเร็จ`);
      if (selectedSubject === name) setSelectedSubject('');
      if (filterSubject === name) setFilterSubject('');
      await loadSubjects();
      await loadFiles(filterSubject === name ? '' : filterSubject);
    } catch (e: any) { setError(e.message); }
  };

  const deleteFile = async (f: VideoFile) => {
    if (!confirm(`ลบ "${f.name}" ใช่ไหม?`)) return;
    const path = `${f.course_slug}/${f.name}`;
    const res = await fetch(`/military/api/v1/videos/${encodeURIComponent(path)}/`, {
      method: 'DELETE', headers: { 'X-CSRFToken': csrf }, credentials: 'include',
    });
    if (res.ok) { loadFiles(filterSubject); loadSubjects(); }
    else setError('ลบไม่สำเร็จ');
  };

  const copyUrl = (f: VideoFile) => {
    navigator.clipboard.writeText('https://signalstandard.rta.mi.th' + f.url);
    setCopiedUrl(f.url); setTimeout(() => setCopiedUrl(''), 2000);
  };

  const grouped = files.reduce<Record<string, VideoFile[]>>((acc, f) => {
    (acc[f.course_slug] = acc[f.course_slug] || []).push(f); return acc;
  }, {});

  const doneCount = uploadQueue.filter(u => u.status === 'done').length;
  const errorCount = uploadQueue.filter(u => u.status === 'error').length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">จัดการวิดีโอการสอน</h1>
        <p className="text-gray-500 mt-1 text-sm">วิดีโอแยกตามหมวดหมู่ — คุณจะเห็นเฉพาะวิดีโอที่คุณอัปโหลด</p>
      </div>

      {/* Subject Management */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-700 text-sm">📁 หมวดหมู่วิดีโอ</h2>
          <span className="text-xs text-gray-400">{subjects.length} หมวดหมู่</span>
        </div>
        <div className="px-4 py-3 border-b border-gray-100 flex gap-2">
          <input type="text" value={newSubjectName} onChange={e => setNewSubjectName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createSubject()}
            placeholder="ชื่อหมวดหมู่ใหม่ เช่น วิชาวิทยุ, บทที่ 1"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-400 focus:outline-none" />
          <button onClick={createSubject} disabled={creatingSubject || !newSubjectName.trim()}
            className="px-4 py-2 bg-[#4A1A6B] text-white rounded-lg text-sm font-medium hover:bg-[#2D0F42] disabled:opacity-50 whitespace-nowrap">
            {creatingSubject ? '...' : '+ สร้าง'}
          </button>
        </div>
        {loadingSubjects ? (
          <div className="p-4 text-center text-gray-400 text-sm">กำลังโหลด...</div>
        ) : subjects.length === 0 ? (
          <div className="p-4 text-center text-gray-400 text-sm">ยังไม่มีหมวดหมู่ — สร้างด้านบน</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {subjects.map(s => (
              <div key={s.name} onClick={() => setSelectedSubject(s.name)}
                className={`px-4 py-2.5 flex items-center gap-3 cursor-pointer transition-colors
                  ${selectedSubject === s.name ? 'bg-purple-50 border-l-4 border-l-[#4A1A6B]' : 'hover:bg-gray-50'}`}>
                <span className="text-lg">📁</span>
                <span className={`flex-1 text-sm font-medium ${selectedSubject === s.name ? 'text-[#4A1A6B]' : 'text-gray-700'}`}>
                  {s.name}
                </span>
                <span className="text-xs text-gray-400">{s.file_count} ไฟล์</span>
                <button onClick={e => { e.stopPropagation(); deleteSubject(s.name); }}
                  className="text-xs text-red-400 hover:text-red-600 px-2 py-0.5 rounded hover:bg-red-50">ลบ</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {msg && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{msg}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

      {/* Upload Zone — รองรับหลายไฟล์ */}
      {selectedSubject ? (
        <div>
          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onClick={() => !isUploading && fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
              ${dragging ? 'border-purple-500 bg-purple-50'
                : isUploading ? 'border-yellow-400 bg-yellow-50 cursor-default'
                : 'border-gray-300 hover:border-purple-400 hover:bg-gray-50'}`}
          >
            {isUploading ? (
              <div className="space-y-2">
                <div className="text-yellow-600 font-medium">กำลังอัปโหลดเข้า "{selectedSubject}"</div>
                <p className="text-xs text-gray-500">อย่าปิดหน้านี้ระหว่างอัปโหลด</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-4xl">🎬</div>
                <div className="text-gray-600 font-medium">
                  ลากไฟล์มาวาง → <span className="text-[#4A1A6B] font-semibold">{selectedSubject}</span>
                </div>
                <div className="text-gray-400 text-sm">หรือคลิกเพื่อเลือกไฟล์ · รองรับหลายไฟล์พร้อมกัน</div>
              </div>
            )}
            <input ref={fileRef} type="file" accept="video/*" multiple
              onChange={e => {
                const fs = Array.from(e.target.files || []);
                if (fs.length) addFiles(fs);
                e.target.value = '';
              }}
              className="hidden" />
          </div>

          {/* Upload Queue */}
          {uploadQueue.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">
                  คิวอัปโหลด ({doneCount}/{uploadQueue.length} เสร็จ{errorCount > 0 ? `, ${errorCount} ผิดพลาด` : ''})
                </span>
                {!isUploading && (
                  <button onClick={() => setUploadQueue([])}
                    className="text-xs text-gray-400 hover:text-gray-600">ล้างคิว</button>
                )}
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {uploadQueue.map(item => (
                  <div key={item.id} className="bg-white border border-gray-200 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="text-xs text-gray-700 truncate flex-1">{item.file.name}</span>
                      <span className="text-xs shrink-0">
                        {item.status === 'done' && <span className="text-green-600">✓ เสร็จ</span>}
                        {item.status === 'error' && <span className="text-red-500">✕ ผิดพลาด</span>}
                        {item.status === 'uploading' && <span className="text-blue-600">{item.progress}%</span>}
                        {item.status === 'pending' && <span className="text-gray-400">รอ...</span>}
                      </span>
                    </div>
                    {(item.status === 'uploading' || item.status === 'done') && (
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full transition-all ${item.status === 'done' ? 'bg-green-500' : 'bg-purple-500'}`}
                          style={{ width: `${item.progress}%` }} />
                      </div>
                    )}
                    {item.status === 'error' && (
                      <p className="text-xs text-red-500 mt-0.5">{item.error}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
          เลือกหมวดหมู่ด้านบนก่อนอัปโหลดวิดีโอ
        </div>
      )}

      {/* Filter + File list */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-600">กรองตามหมวดหมู่:</span>
        <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-purple-400 focus:outline-none">
          <option value="">ทั้งหมด</option>
          {subjects.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
        </select>
        <span className="text-sm text-gray-400">{files.length} ไฟล์</span>
      </div>

      {loadingFiles ? (
        <div className="text-center text-gray-400 py-8">กำลังโหลด...</div>
      ) : files.length === 0 ? (
        <div className="text-center text-gray-400 py-8 border border-dashed border-gray-200 rounded-xl">
          ยังไม่มีวิดีโอ{filterSubject ? ` ในหมวด "${filterSubject}"` : ''}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([subjectName, vids]) => (
            <div key={subjectName} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>📁</span>
                  <span className="font-semibold text-gray-700 text-sm">{subjectName}</span>
                </div>
                <span className="text-xs text-gray-400">{vids.length} ไฟล์</span>
              </div>
              <div className="divide-y divide-gray-100">
                {vids.map(f => (
                  <div key={f.url} className="px-4 py-3 flex items-center gap-4 hover:bg-gray-50">
                    <span className="text-xl">🎬</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 truncate text-sm">{f.name}</div>
                      <div className="text-xs text-gray-400">
                        {formatSize(f.size)} • {new Date(f.modified * 1000).toLocaleDateString('th-TH')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => copyUrl(f)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${copiedUrl === f.url ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}>
                        {copiedUrl === f.url ? '✓ คัดลอกแล้ว' : '📋 คัดลอก URL'}
                      </button>
                      <button onClick={() => deleteFile(f)}
                        className="text-xs px-3 py-1.5 rounded-lg text-red-500 hover:bg-red-50 font-medium">
                        ลบ
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-800">
        <div className="font-semibold mb-1">วิธีใช้ URL ใน edX Studio:</div>
        <p className="text-blue-700">กด <strong>คัดลอก URL</strong> → Studio → Add Component → Video → วาง URL</p>
      </div>
    </div>
  );
}
