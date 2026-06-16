'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

interface Subject { name: string; file_count: number; }
interface DocFile {
  name: string; size: number; url: string; modified: number;
  course_slug: string; uploader: string;
  is_shared_with_me?: boolean;
  share_count?: number;  // folder-level count
}
interface ShareInstructor {
  id: number; username: string; full_name: string; already_shared: boolean;
}
interface UploadItem {
  id: string; file: File; progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string; url?: string;
}

const MAX_RETRIES = 3;
const STALL_TIMEOUT = 45000;
const PROCESS_TIMEOUT = 120000;
const ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx';

function formatSize(b: number) {
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1024 ** 3) return (b / 1024 / 1024).toFixed(1) + ' MB';
  return (b / 1024 ** 3).toFixed(2) + ' GB';
}
function getCookie(name: string) {
  const v = document.cookie.match('(^|;) ?' + name + '=([^;]*)(;|$)');
  return v ? v[2] : null;
}
function fileIcon(name: string) {
  const e = name.split('.').pop()?.toLowerCase();
  if (e === 'pdf') return '📕';
  if (e === 'doc' || e === 'docx') return '📘';
  if (e === 'ppt' || e === 'pptx') return '📙';
  if (e === 'xls' || e === 'xlsx') return '📗';
  return '📄';
}
function fileIsOffice(name: string) {
  return /\.(doc|docx|ppt|pptx|xls|xlsx)$/i.test(name);
}

export default function DocumentsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [creatingSubject, setCreatingSubject] = useState(false);
  const [filterSubject, setFilterSubject] = useState('');
  const [files, setFiles] = useState<DocFile[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  // Share folder state
  const [shareFolder, setShareFolder] = useState<string | null>(null);
  const [shareInstructors, setShareInstructors] = useState<ShareInstructor[]>([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareSearch, setShareSearch] = useState('');
  const [shareCounts, setShareCounts] = useState<Record<string, number>>({});

  const fileRef = useRef<HTMLInputElement>(null);
  const csrf = getCookie('csrftoken') || '';

  const isUploading = uploadQueue.some(u => u.status === 'uploading' || u.status === 'pending');

  const myFiles = files.filter(f => !f.is_shared_with_me);
  const sharedFiles = files.filter(f => f.is_shared_with_me);

  // Group shared files by uploader::course_slug
  const sharedGrouped = sharedFiles.reduce<Record<string, DocFile[]>>((acc, f) => {
    const key = `${f.uploader}::${f.course_slug}`;
    (acc[key] = acc[key] || []).push(f); return acc;
  }, {});

  const loadSubjects = useCallback(async () => {
    setLoadingSubjects(true);
    try {
      const res = await fetch('/military/api/v1/documents/subjects/', { credentials: 'include' });
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
      const res = await fetch(`/military/api/v1/documents/${qs}`, { credentials: 'include' });
      const data = await res.json();
      const fileList: DocFile[] = data.files || [];
      setFiles(fileList);
      const counts: Record<string, number> = {};
      fileList.forEach(f => {
        if (!f.is_shared_with_me && f.share_count !== undefined) {
          counts[f.course_slug] = f.share_count;
        }
      });
      setShareCounts(counts);
    } catch { setError('ไม่สามารถโหลดรายการไฟล์ได้'); }
    finally { setLoadingFiles(false); }
  }, []);

  useEffect(() => { loadSubjects(); }, [loadSubjects]);
  useEffect(() => { loadFiles(filterSubject); }, [filterSubject, loadFiles]);

  const openShareModal = async (courseSlug: string) => {
    setShareFolder(courseSlug);
    setShareSearch('');
    setShareLoading(true);
    try {
      const data = await api.getDocShare(courseSlug);
      setShareInstructors(data.instructors || []);
    } catch { setShareInstructors([]); }
    finally { setShareLoading(false); }
  };

  const toggleShare = async (courseSlug: string, instructor: ShareInstructor) => {
    try {
      if (instructor.already_shared) {
        await api.removeDocShare(courseSlug, instructor.username);
      } else {
        await api.addDocShare(courseSlug, instructor.username);
      }
      const delta = instructor.already_shared ? -1 : 1;
      setShareInstructors(prev =>
        prev.map(i => i.id === instructor.id ? { ...i, already_shared: !i.already_shared } : i)
      );
      setShareCounts(prev => ({ ...prev, [courseSlug]: Math.max(0, (prev[courseSlug] ?? 0) + delta) }));
    } catch (e: any) { setError(e.message); }
  };

  const uploadSingle = useCallback((item: UploadItem, subject: string, attempt = 1): Promise<void> => {
    return new Promise(resolve => {
      setUploadQueue(q => q.map(u => u.id === item.id
        ? { ...u, status: 'uploading', progress: 0,
            error: attempt > 1 ? `กำลังลองใหม่ครั้งที่ ${attempt}/${MAX_RETRIES}…` : undefined } : u));

      const form = new FormData();
      form.append('file', item.file);
      form.append('course_slug', subject);

      const xhr = new XMLHttpRequest();
      let settled = false;
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      const clearWatchdog = () => { if (watchdog) clearTimeout(watchdog); };
      const armWatchdog = (ms: number) => { clearWatchdog(); watchdog = setTimeout(() => xhr.abort(), ms); };

      const retryOrFail = (reason: string) => {
        if (settled) return;
        settled = true;
        clearWatchdog();
        if (attempt < MAX_RETRIES) {
          const backoff = 2000 * attempt;
          setUploadQueue(q => q.map(u => u.id === item.id
            ? { ...u, status: 'uploading', error: `${reason} — ลองใหม่ใน ${backoff / 1000} วิ` } : u));
          setTimeout(() => { uploadSingle(item, subject, attempt + 1).then(resolve); }, backoff);
        } else {
          setUploadQueue(q => q.map(u => u.id === item.id
            ? { ...u, status: 'error', error: `${reason} (ลองครบ ${MAX_RETRIES} ครั้งแล้ว)` } : u));
          resolve();
        }
      };

      xhr.upload.addEventListener('progress', e => {
        armWatchdog(STALL_TIMEOUT);
        if (e.lengthComputable) {
          const pct = Math.round(e.loaded / e.total * 100);
          setUploadQueue(q => q.map(u => u.id === item.id ? { ...u, progress: pct } : u));
        }
      });
      xhr.upload.addEventListener('load', () => {
        armWatchdog(PROCESS_TIMEOUT);
        setUploadQueue(q => q.map(u => u.id === item.id ? { ...u, progress: 99 } : u));
      });
      xhr.addEventListener('load', () => {
        clearWatchdog();
        if (settled) return;
        let result: any = null;
        try { result = JSON.parse(xhr.responseText); } catch { /* non-JSON */ }
        if (result && xhr.status === 200 && result.success) {
          settled = true;
          setUploadQueue(q => q.map(u => u.id === item.id
            ? { ...u, status: 'done', progress: 100, url: result.url, error: undefined } : u));
          resolve();
        } else if (result && result.error && xhr.status >= 400 && xhr.status < 500) {
          settled = true;
          setUploadQueue(q => q.map(u => u.id === item.id
            ? { ...u, status: 'error', error: result.error } : u));
          resolve();
        } else {
          retryOrFail(`เซิร์ฟเวอร์ตอบผิดพลาด (${xhr.status || 'ไม่ทราบ'})`);
        }
      });
      xhr.addEventListener('error', () => retryOrFail('การเชื่อมต่อหลุด'));
      xhr.addEventListener('timeout', () => retryOrFail('หมดเวลาเชื่อมต่อ'));
      xhr.addEventListener('abort', () => retryOrFail('การเชื่อมต่อค้าง'));

      xhr.open('POST', '/military/api/v1/documents/upload/');
      xhr.setRequestHeader('X-CSRFToken', csrf);
      xhr.withCredentials = true;
      armWatchdog(STALL_TIMEOUT);
      xhr.send(form);
    });
  }, [csrf]);

  const addFiles = useCallback(async (newFiles: File[]) => {
    if (!selectedSubject) { setError('กรุณาเลือกหมวดหมู่ก่อนอัปโหลด'); return; }
    setError(''); setMsg('');
    const items: UploadItem[] = newFiles.map(f => ({
      id: Math.random().toString(36).slice(2),
      file: f, progress: 0, status: 'pending',
    }));
    setUploadQueue(q => [...q, ...items]);
    for (const item of items) {
      await uploadSingle(item, selectedSubject);
    }
    await loadFiles(filterSubject);
    await loadSubjects();
  }, [selectedSubject, uploadSingle, loadFiles, loadSubjects, filterSubject]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter(
      f => f.name.match(/\.(pdf|docx?|pptx?|xlsx?)$/i));
    if (dropped.length > 0) addFiles(dropped);
    else setError('กรุณาเลือกไฟล์ PDF หรือเอกสาร (doc, ppt, xls)');
  }, [addFiles]);

  const createSubject = async () => {
    const name = newSubjectName.trim();
    if (!name) return;
    setCreatingSubject(true); setError(''); setMsg('');
    try {
      const res = await fetch('/military/api/v1/documents/subjects/', {
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

  const renameSubject = async (oldName: string) => {
    const newName = prompt(`แก้ไขชื่อหมวดหมู่ "${oldName}"`, oldName);
    if (newName === null) return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    setError(''); setMsg('');
    try {
      const res = await fetch('/military/api/v1/documents/subjects/', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
        body: JSON.stringify({ old_name: oldName, new_name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'แก้ไขไม่สำเร็จ');
      setMsg(`เปลี่ยนชื่อเป็น "${data.name}" สำเร็จ`);
      if (selectedSubject === oldName) setSelectedSubject(data.name);
      if (filterSubject === oldName) setFilterSubject(data.name);
      await loadSubjects();
      await loadFiles(filterSubject === oldName ? data.name : filterSubject);
    } catch (e: any) { setError(e.message); }
  };

  const deleteSubject = async (name: string) => {
    if (!confirm(`ลบหมวดหมู่ "${name}" และเอกสารทั้งหมดในนั้น ใช่ไหม?`)) return;
    setError(''); setMsg('');
    try {
      const res = await fetch('/military/api/v1/documents/subjects/', {
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

  const deleteFile = async (f: DocFile) => {
    if (!confirm(`ลบ "${f.name}" ใช่ไหม?`)) return;
    setError(''); setMsg('');
    const res = await fetch('/military/api/v1/documents/delete/', {
      method: 'DELETE', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
      body: JSON.stringify({ course_slug: f.course_slug, filename: f.name, uploader: f.uploader }),
    });
    if (res.ok) { loadFiles(filterSubject); loadSubjects(); }
    else setError((await res.json().catch(() => ({}))).error || 'ลบไม่สำเร็จ');
  };

  const copyUrl = (f: DocFile) => {
    navigator.clipboard.writeText('https://signalstandard.rta.mi.th' + f.url);
    setCopiedUrl(f.url); setTimeout(() => setCopiedUrl(''), 2000);
  };

  const myGrouped = myFiles.reduce<Record<string, DocFile[]>>((acc, f) => {
    (acc[f.course_slug] = acc[f.course_slug] || []).push(f); return acc;
  }, {});

  const filteredShareInstructors = shareSearch
    ? shareInstructors.filter(i =>
        i.username.toLowerCase().includes(shareSearch.toLowerCase()) ||
        (i.full_name || '').toLowerCase().includes(shareSearch.toLowerCase()))
    : shareInstructors;

  const doneCount = uploadQueue.filter(u => u.status === 'done').length;
  const errorCount = uploadQueue.filter(u => u.status === 'error').length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">จัดการเอกสาร / ตำราเรียน (PDF)</h1>
        <p className="text-gray-500 mt-1 text-sm">เอกสารแยกตามหมวดหมู่ — คุณจะเห็นเฉพาะไฟล์ที่คุณอัปโหลด · มีแถบแสดงความคืบหน้า</p>
      </div>

      {/* Subject Management */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-700 text-sm">📁 หมวดหมู่เอกสาร</h2>
          <span className="text-xs text-gray-400">{subjects.length} หมวดหมู่</span>
        </div>
        <div className="px-4 py-3 border-b border-gray-100 flex gap-2">
          <input type="text" value={newSubjectName} onChange={e => setNewSubjectName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createSubject()}
            placeholder="ชื่อหมวดหมู่ใหม่ เช่น คู่มือวิทยุ, บทที่ 1"
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
                <button onClick={e => { e.stopPropagation(); renameSubject(s.name); }}
                  className="text-xs text-blue-400 hover:text-blue-600 px-2 py-0.5 rounded hover:bg-blue-50">แก้ไข</button>
                <button onClick={e => { e.stopPropagation(); deleteSubject(s.name); }}
                  className="text-xs text-red-400 hover:text-red-600 px-2 py-0.5 rounded hover:bg-red-50">ลบ</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {msg && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{msg}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

      {/* Upload Zone */}
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
                <div className="text-4xl">📄</div>
                <div className="text-gray-600 font-medium">
                  ลากไฟล์มาวาง → <span className="text-[#4A1A6B] font-semibold">{selectedSubject}</span>
                </div>
                <div className="text-gray-400 text-sm">หรือคลิกเพื่อเลือกไฟล์ · PDF / Word / PowerPoint / Excel · รองรับหลายไฟล์</div>
                <div className="text-xs text-purple-500 bg-purple-50 rounded-lg px-3 py-1.5 inline-block mt-1">
                  ⚡ Word / PPT / Excel จะถูกแปลงเป็น PDF อัตโนมัติ
                </div>
              </div>
            )}
            <input ref={fileRef} type="file" accept={ACCEPT} multiple
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
                      <span className="text-xs text-gray-700 truncate flex-1">{fileIcon(item.file.name)} {item.file.name}</span>
                      <span className="text-xs shrink-0">
                        {item.status === 'done' && <span className="text-green-600">✓ เสร็จ{fileIsOffice(item.file.name) ? ' (PDF)' : ''}</span>}
                        {item.status === 'error' && <span className="text-red-500">✕ ผิดพลาด</span>}
                        {item.status === 'uploading' && item.progress < 99 && <span className="text-blue-600">{item.progress}%</span>}
                        {item.status === 'uploading' && item.progress >= 99 && (
                          <span className="text-amber-600">
                            {fileIsOffice(item.file.name) ? '🔄 กำลังแปลง PDF...' : 'กำลังบันทึก...'}
                          </span>
                        )}
                        {item.status === 'pending' && <span className="text-gray-400">รอ...</span>}
                      </span>
                    </div>
                    {(item.status === 'uploading' || item.status === 'done') && (
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full transition-all ${item.status === 'done' ? 'bg-green-500' : 'bg-purple-500'}`}
                          style={{ width: `${item.progress}%` }} />
                      </div>
                    )}
                    {item.status === 'uploading' && item.error && (
                      <p className="text-xs text-amber-600 mt-0.5">{item.error}</p>
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
          เลือกหมวดหมู่ด้านบนก่อนอัปโหลดเอกสาร
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
        <span className="text-sm text-gray-400">{myFiles.length} ไฟล์ของฉัน</span>
      </div>

      {loadingFiles ? (
        <div className="text-center text-gray-400 py-8">กำลังโหลด...</div>
      ) : myFiles.length === 0 && sharedFiles.length === 0 ? (
        <div className="text-center text-gray-400 py-8 border border-dashed border-gray-200 rounded-xl">
          ยังไม่มีเอกสาร{filterSubject ? ` ในหมวด "${filterSubject}"` : ''}
        </div>
      ) : (
        <div className="space-y-4">
          {/* My files */}
          {Object.entries(myGrouped).map(([subjectName, docs]) => {
            const count = shareCounts[subjectName] ?? 0;
            return (
              <div key={subjectName} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                  <span>📁</span>
                  <span className="font-semibold text-gray-700 text-sm flex-1">{subjectName}</span>
                  <span className="text-xs text-gray-400">{docs.length} ไฟล์</span>
                  <button
                    onClick={() => openShareModal(subjectName)}
                    className={`text-xs px-3 py-1 rounded-lg font-medium border transition-all ${
                      count > 0
                        ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200'
                    }`}>
                    👥 แชร์{count > 0 ? ` (${count})` : ''}
                  </button>
                </div>
                <div className="divide-y divide-gray-100">
                  {docs.map(f => (
                    <div key={f.url} className="px-4 py-3 flex items-center gap-4 hover:bg-gray-50">
                      <span className="text-xl">{fileIcon(f.name)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800 truncate text-sm">{f.name}</div>
                        <div className="text-xs text-gray-400">
                          {formatSize(f.size)} • {new Date(f.modified * 1000).toLocaleDateString('th-TH')}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <a href={'https://signalstandard.rta.mi.th' + f.url} target="_blank" rel="noopener noreferrer"
                          className="text-xs px-3 py-1.5 rounded-lg font-medium bg-gray-50 text-gray-600 hover:bg-gray-100">
                          เปิด
                        </a>
                        <button onClick={() => copyUrl(f)}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${copiedUrl === f.url ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}>
                          {copiedUrl === f.url ? '✓ คัดลอกแล้ว' : '📋 URL'}
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
            );
          })}

          {/* Shared with me */}
          {sharedFiles.length > 0 && (
            <div className="mt-6">
              <h2 className="text-base font-semibold text-gray-700 mb-3">📄 เอกสารที่แชร์ให้ฉัน</h2>
              {Object.entries(sharedGrouped).map(([key, docs]) => {
                const [uploader, courseSlug] = key.split('::');
                return (
                  <div key={key} className="bg-white border border-green-200 rounded-xl overflow-hidden mb-4">
                    <div className="px-4 py-2.5 bg-green-50 border-b border-green-200 flex items-center gap-2">
                      <span>👤</span>
                      <span className="font-semibold text-green-800 text-sm">{uploader}</span>
                      <span className="text-xs text-green-600">/ {courseSlug}</span>
                      <span className="text-xs text-green-600 ml-auto">{docs.length} ไฟล์</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {docs.map(f => (
                        <div key={f.url} className="px-4 py-3 flex items-center gap-4 hover:bg-green-50">
                          <span className="text-xl">{fileIcon(f.name)}</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-800 truncate text-sm">{f.name}</div>
                            <div className="text-xs text-gray-400">
                              {formatSize(f.size)} • {new Date(f.modified * 1000).toLocaleDateString('th-TH')}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <a href={'https://signalstandard.rta.mi.th' + f.url} target="_blank" rel="noopener noreferrer"
                              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-gray-50 text-gray-600 hover:bg-gray-100">
                              เปิด
                            </a>
                            <button onClick={() => copyUrl(f)}
                              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${copiedUrl === f.url ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}>
                              {copiedUrl === f.url ? '✓ คัดลอกแล้ว' : '📋 URL'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-800">
        <div className="font-semibold mb-1">วิธีใช้ใน edX Studio (PDF Viewer):</div>
        <p className="text-blue-700">กด <strong>คัดลอก URL</strong> → Studio → unit → Add New Component → Advanced → <strong>PDF Viewer</strong> → วาง URL</p>
      </div>

      {/* Share Folder Modal */}
      {shareFolder && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">แชร์ folder เอกสาร</h3>
                <p className="text-xs text-gray-500 mt-0.5">📁 {shareFolder} — ครูที่เลือกจะเห็นทุกไฟล์ใน folder นี้</p>
              </div>
              <button onClick={() => setShareFolder(null)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            <div className="px-5 py-3 border-b border-gray-100">
              <input type="text" placeholder="ค้นหาชื่อหรือ username..."
                value={shareSearch} onChange={e => setShareSearch(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-400 focus:outline-none" />
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 px-2 py-2">
              {shareLoading ? (
                <div className="text-center text-gray-400 py-6 text-sm">กำลังโหลด...</div>
              ) : filteredShareInstructors.length === 0 ? (
                <div className="text-center text-gray-400 py-6 text-sm">ไม่พบครูผู้สอนคนอื่น</div>
              ) : filteredShareInstructors.map(i => (
                <div key={i.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-semibold text-sm shrink-0">
                    {(i.full_name || i.username)[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{i.full_name || i.username}</div>
                    <div className="text-xs text-gray-400">@{i.username}</div>
                  </div>
                  <button onClick={() => toggleShare(shareFolder, i)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                      i.already_shared
                        ? 'bg-green-100 text-green-700 hover:bg-red-50 hover:text-red-600'
                        : 'bg-gray-100 text-gray-600 hover:bg-purple-50 hover:text-purple-700'
                    }`}>
                    {i.already_shared ? '✓ แชร์แล้ว' : '+ แชร์'}
                  </button>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-gray-100">
              <button onClick={() => setShareFolder(null)}
                className="w-full py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">ปิด</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
