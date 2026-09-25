'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

interface Subject { name: string; file_count: number; }
interface VideoFile {
  name: string; size: number; url: string; modified: number;
  course_slug: string; uploader: string;
  is_shared_with_me?: boolean;
  share_count?: number;
}
interface ShareInstructor {
  id: number; username: string; full_name: string; already_shared: boolean;
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

const MAX_RETRIES = 3;
const STALL_TIMEOUT = 45000;
const PROCESS_TIMEOUT = 180000;

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
  const [moveTarget, setMoveTarget] = useState<VideoFile | null>(null);
  const [moveTo, setMoveTo] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  // Share folder state
  const [shareFolder, setShareFolder] = useState<string | null>(null);
  const [shareInstructors, setShareInstructors] = useState<ShareInstructor[]>([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareSearch, setShareSearch] = useState('');
  // folder-level share counts: { courseSlug: count }
  const [shareCounts, setShareCounts] = useState<Record<string, number>>({});

  const fileRef = useRef<HTMLInputElement>(null);
  const csrf = getCookie('csrftoken') || '';
  const isUploading = uploadQueue.some(u => u.status === 'uploading' || u.status === 'pending');

  const myFiles = files.filter(f => !f.is_shared_with_me);
  const sharedFiles = files.filter(f => f.is_shared_with_me);

  const myGrouped = myFiles.reduce<Record<string, VideoFile[]>>((acc, f) => {
    (acc[f.course_slug] = acc[f.course_slug] || []).push(f); return acc;
  }, {});
  // group shared files by "uploader::course_slug"
  const sharedGrouped = sharedFiles.reduce<Record<string, VideoFile[]>>((acc, f) => {
    const key = `${f.uploader}::${f.course_slug}`;
    (acc[key] = acc[key] || []).push(f); return acc;
  }, {});

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
      const fileList: VideoFile[] = data.files || [];
      setFiles(fileList);
      // build share count map from first file of each folder
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
      const data = await api.getVideoShare(courseSlug);
      setShareInstructors(data.instructors || []);
    } catch { setError('โหลดรายชื่อครูไม่สำเร็จ'); setShareFolder(null); }
    finally { setShareLoading(false); }
  };

  const toggleShare = async (courseSlug: string, instructor: ShareInstructor) => {
    try {
      if (instructor.already_shared) {
        await api.removeVideoShare(courseSlug, instructor.username);
      } else {
        await api.addVideoShare(courseSlug, instructor.username);
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

      xhr.open('POST', '/military/api/v1/videos/upload/');
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
      f => f.type.startsWith('video/') || f.name.match(/\.(mp4|mov|avi|mkv|webm|flv|wmv)$/i));
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

  const renameSubject = async (oldName: string) => {
    const newName = prompt(`แก้ไขชื่อหมวดหมู่ "${oldName}"`, oldName);
    if (newName === null) return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    setError(''); setMsg('');
    try {
      const res = await fetch('/military/api/v1/videos/subjects/', {
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
    setError(''); setMsg('');
    const res = await fetch('/military/api/v1/videos/delete/', {
      method: 'DELETE', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
      body: JSON.stringify({ course_slug: f.course_slug, filename: f.name, uploader: f.uploader }),
    });
    if (res.ok) { loadFiles(filterSubject); loadSubjects(); }
    else setError((await res.json().catch(() => ({}))).error || 'ลบไม่สำเร็จ');
  };

  const moveFile = async () => {
    if (!moveTarget || !moveTo || moveTo === moveTarget.course_slug) { setMoveTarget(null); return; }
    setError(''); setMsg('');
    try {
      const res = await fetch('/military/api/v1/videos/move/', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
        body: JSON.stringify({
          course_slug: moveTarget.course_slug, filename: moveTarget.name,
          new_course_slug: moveTo, uploader: moveTarget.uploader,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ย้ายไม่สำเร็จ');
      setMsg(`ย้าย "${moveTarget.name}" → "${moveTo}" สำเร็จ`);
      setMoveTarget(null); setMoveTo('');
      await loadFiles(filterSubject);
      await loadSubjects();
    } catch (e: any) { setError(e.message); }
  };

  const copyUrl = (f: VideoFile) => {
    navigator.clipboard.writeText('https://signalstandard.rta.mi.th' + f.url);
    setCopiedUrl(f.url); setTimeout(() => setCopiedUrl(''), 2000);
  };

  const doneCount = uploadQueue.filter(u => u.status === 'done').length;
  const errorCount = uploadQueue.filter(u => u.status === 'error').length;

  const filteredShareInstructors = shareSearch
    ? shareInstructors.filter(i =>
        i.username.toLowerCase().includes(shareSearch.toLowerCase()) ||
        (i.full_name || '').toLowerCase().includes(shareSearch.toLowerCase()))
    : shareInstructors;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#2D0F42]">จัดการวิดีโอการสอน</h1>
        <p className="text-[#6b6478] mt-1 text-sm">วิดีโอแยกตามหมวดหมู่ — แชร์ทั้ง folder ให้ครูอื่นได้เลยด้วยปุ่ม 👥 แชร์</p>
      </div>

      {/* Subject Management */}
      <div className="bg-white border border-[#e6e1ee] rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-[#f7f5fa] border-b border-[#e6e1ee] flex items-center justify-between">
          <h2 className="font-semibold text-[#4a4456] text-sm">📁 หมวดหมู่วิดีโอ</h2>
          <span className="text-xs text-[#9a92a8]">{subjects.length} หมวดหมู่</span>
        </div>
        <div className="px-4 py-3 border-b border-[#f0ecf6] flex gap-2">
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
          <div className="p-4 text-center text-[#9a92a8] text-sm">กำลังโหลด...</div>
        ) : subjects.length === 0 ? (
          <div className="p-4 text-center text-[#9a92a8] text-sm">ยังไม่มีหมวดหมู่ — สร้างด้านบน</div>
        ) : (
          <div className="divide-y divide-[#f0ecf6]">
            {subjects.map(s => (
              <div key={s.name} onClick={() => setSelectedSubject(s.name)}
                className={`px-4 py-2.5 flex items-center gap-3 cursor-pointer transition-colors
                  ${selectedSubject === s.name ? 'bg-purple-50 border-l-4 border-l-[#4A1A6B]' : 'hover:bg-[#f7f5fa]'}`}>
                <span className="text-lg">📁</span>
                <span className={`flex-1 text-sm font-medium ${selectedSubject === s.name ? 'text-[#4A1A6B]' : 'text-[#4a4456]'}`}>
                  {s.name}
                </span>
                <span className="text-xs text-[#9a92a8]">{s.file_count} ไฟล์</span>
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
                : 'border-gray-300 hover:border-purple-400 hover:bg-[#f7f5fa]'}`}
          >
            {isUploading ? (
              <div className="space-y-2">
                <div className="text-yellow-600 font-medium">กำลังอัปโหลดเข้า "{selectedSubject}"</div>
                <p className="text-xs text-[#6b6478]">อย่าปิดหน้านี้ระหว่างอัปโหลด</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-4xl">🎬</div>
                <div className="text-[#6b6478] font-medium">
                  ลากไฟล์มาวาง → <span className="text-[#4A1A6B] font-semibold">{selectedSubject}</span>
                </div>
                <div className="text-[#9a92a8] text-sm">หรือคลิกเพื่อเลือกไฟล์ · รองรับหลายไฟล์พร้อมกัน</div>
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

          {uploadQueue.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#6b6478]">
                  คิวอัปโหลด ({doneCount}/{uploadQueue.length} เสร็จ{errorCount > 0 ? `, ${errorCount} ผิดพลาด` : ''})
                </span>
                {!isUploading && (
                  <button onClick={() => setUploadQueue([])} className="text-xs text-[#9a92a8] hover:text-[#6b6478]">ล้างคิว</button>
                )}
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {uploadQueue.map(item => (
                  <div key={item.id} className="bg-white border border-[#e6e1ee] rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="text-xs text-[#4a4456] truncate flex-1">{item.file.name}</span>
                      <span className="text-xs shrink-0">
                        {item.status === 'done' && <span className="text-green-600">✓ เสร็จ</span>}
                        {item.status === 'error' && <span className="text-red-500">✕ ผิดพลาด</span>}
                        {item.status === 'uploading' && <span className="text-blue-600">{item.progress}%</span>}
                        {item.status === 'pending' && <span className="text-[#9a92a8]">รอ...</span>}
                      </span>
                    </div>
                    {(item.status === 'uploading' || item.status === 'done') && (
                      <div className="w-full bg-[#f0ecf6] rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full transition-all ${item.status === 'done' ? 'bg-green-500' : 'bg-purple-500'}`}
                          style={{ width: `${item.progress}%` }} />
                      </div>
                    )}
                    {item.status === 'uploading' && item.error && <p className="text-xs text-amber-600 mt-0.5">{item.error}</p>}
                    {item.status === 'error' && <p className="text-xs text-red-500 mt-0.5">{item.error}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="border-2 border-dashed border-[#e6e1ee] rounded-xl p-8 text-center text-[#9a92a8] text-sm">
          เลือกหมวดหมู่ด้านบนก่อนอัปโหลดวิดีโอ
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-[#6b6478]">กรองตามหมวดหมู่:</span>
        <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-purple-400 focus:outline-none">
          <option value="">ทั้งหมด</option>
          {subjects.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
        </select>
        <span className="text-sm text-[#9a92a8]">{myFiles.length} ไฟล์ของฉัน</span>
      </div>

      {loadingFiles ? (
        <div className="text-center text-[#9a92a8] py-8">กำลังโหลด...</div>
      ) : myFiles.length === 0 && sharedFiles.length === 0 ? (
        <div className="text-center text-[#9a92a8] py-8 border border-dashed border-[#e6e1ee] rounded-xl">
          ยังไม่มีวิดีโอ{filterSubject ? ` ในหมวด "${filterSubject}"` : ''}
        </div>
      ) : (
        <div className="space-y-4">
          {/* My folders */}
          {Object.entries(myGrouped).map(([subjectName, vids]) => {
            const count = shareCounts[subjectName] ?? 0;
            return (
              <div key={subjectName} className="bg-white border border-[#e6e1ee] rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-[#f7f5fa] border-b border-[#e6e1ee] flex items-center gap-2">
                  <span>📁</span>
                  <span className="font-semibold text-[#4a4456] text-sm flex-1">{subjectName}</span>
                  <span className="text-xs text-[#9a92a8]">{vids.length} ไฟล์</span>
                  <button
                    onClick={() => openShareModal(subjectName)}
                    className={`text-xs px-3 py-1 rounded-lg font-medium border transition-all ${
                      count > 0
                        ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                        : 'bg-[#f7f5fa] text-[#6b6478] border-[#e6e1ee] hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200'
                    }`}>
                    👥 แชร์{count > 0 ? ` (${count})` : ''}
                  </button>
                </div>
                <div className="divide-y divide-[#f0ecf6]">
                  {vids.map(f => (
                    <div key={f.url} className="px-4 py-3 flex items-center gap-4 hover:bg-[#f7f5fa]">
                      <span className="text-xl">🎬</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-[#2D0F42] truncate text-sm">{f.name}</div>
                        <div className="text-xs text-[#9a92a8]">
                          {formatSize(f.size)} • {new Date(f.modified * 1000).toLocaleDateString('th-TH')}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => copyUrl(f)}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${copiedUrl === f.url ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}>
                          {copiedUrl === f.url ? '✓ คัดลอกแล้ว' : '📋 URL'}
                        </button>
                        <button onClick={() => { setMoveTarget(f); setMoveTo(''); }}
                          className="text-xs px-3 py-1.5 rounded-lg text-amber-600 hover:bg-amber-50 font-medium">ย้าย</button>
                        <button onClick={() => deleteFile(f)}
                          className="text-xs px-3 py-1.5 rounded-lg text-red-500 hover:bg-red-50 font-medium">ลบ</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Shared with me */}
          {sharedFiles.length > 0 && (
            <div className="mt-4">
              <h2 className="text-base font-semibold text-[#4a4456] mb-3">👥 วิดีโอที่แชร์ให้ฉัน</h2>
              {Object.entries(sharedGrouped).map(([key, vids]) => {
                const [uploader, courseSlug] = key.split('::');
                return (
                  <div key={key} className="bg-white border border-purple-200 rounded-xl overflow-hidden mb-4">
                    <div className="px-4 py-2.5 bg-purple-50 border-b border-purple-200 flex items-center gap-2">
                      <span>👤</span>
                      <span className="font-semibold text-purple-800 text-sm">{uploader}</span>
                      <span className="text-xs text-purple-400">/ {courseSlug}</span>
                      <span className="text-xs text-purple-400 ml-auto">{vids.length} ไฟล์</span>
                    </div>
                    <div className="divide-y divide-[#f0ecf6]">
                      {vids.map(f => (
                        <div key={f.url} className="px-4 py-3 flex items-center gap-4 hover:bg-purple-50">
                          <span className="text-xl">🎬</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-[#2D0F42] truncate text-sm">{f.name}</div>
                            <div className="text-xs text-[#9a92a8]">
                              {formatSize(f.size)} • {new Date(f.modified * 1000).toLocaleDateString('th-TH')}
                            </div>
                          </div>
                          <button onClick={() => copyUrl(f)}
                            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${copiedUrl === f.url ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}>
                            {copiedUrl === f.url ? '✓ คัดลอกแล้ว' : '📋 URL'}
                          </button>
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
        <div className="font-semibold mb-1">วิธีใช้ URL ใน edX Studio:</div>
        <p className="text-blue-700">กด <strong>📋 URL</strong> → Studio → Add Component → Video → วาง URL</p>
      </div>

      {/* Share Folder Modal */}
      {shareFolder && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-[#e6e1ee] flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-[#2D0F42]">แชร์ folder วิดีโอ</h3>
                <p className="text-xs text-[#6b6478] mt-0.5">📁 {shareFolder} — ครูที่เลือกจะเห็นทุกไฟล์ใน folder นี้</p>
              </div>
              <button onClick={() => setShareFolder(null)} className="text-[#9a92a8] hover:text-[#6b6478] text-xl leading-none">✕</button>
            </div>
            <div className="px-5 py-3 border-b border-[#f0ecf6]">
              <input type="text" placeholder="ค้นหาชื่อหรือ username..."
                value={shareSearch} onChange={e => setShareSearch(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-400 focus:outline-none" />
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-[#f0ecf6] px-2 py-2">
              {shareLoading ? (
                <div className="text-center text-[#9a92a8] py-6 text-sm">กำลังโหลด...</div>
              ) : filteredShareInstructors.length === 0 ? (
                <div className="text-center text-[#9a92a8] py-6 text-sm">ไม่พบครูผู้สอนคนอื่น</div>
              ) : filteredShareInstructors.map(i => (
                <div key={i.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#f7f5fa]">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-semibold text-sm shrink-0">
                    {(i.full_name || i.username)[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#2D0F42] truncate">{i.full_name || i.username}</div>
                    <div className="text-xs text-[#9a92a8]">@{i.username}</div>
                  </div>
                  <button onClick={() => toggleShare(shareFolder, i)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                      i.already_shared
                        ? 'bg-green-100 text-green-700 hover:bg-red-50 hover:text-red-600'
                        : 'bg-[#f0ecf6] text-[#6b6478] hover:bg-purple-50 hover:text-purple-700'
                    }`}>
                    {i.already_shared ? '✓ แชร์แล้ว' : '+ แชร์'}
                  </button>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-[#f0ecf6]">
              <button onClick={() => setShareFolder(null)}
                className="w-full py-2 text-sm text-[#6b6478] hover:text-[#2D0F42] font-medium">ปิด</button>
            </div>
          </div>
        </div>
      )}

      {/* Move Modal */}
      {moveTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setMoveTarget(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[#4A1A6B] mb-1">ย้ายหมวดหมู่วิดีโอ</h3>
            <p className="text-sm text-[#6b6478] mb-4 truncate">🎬 {moveTarget.name}</p>
            <p className="text-xs text-[#9a92a8] mb-1">หมวดหมู่ปัจจุบัน: <span className="text-[#6b6478]">{moveTarget.course_slug}</span></p>
            <label className="block text-xs font-medium text-[#6b6478] mb-1 mt-3">ย้ายไปหมวดหมู่ใหม่:</label>
            <select value={moveTo} onChange={e => setMoveTo(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-400 focus:outline-none">
              <option value="">— เลือกหมวดหมู่ —</option>
              {subjects.filter(s => s.name !== moveTarget.course_slug).map(s => (
                <option key={s.name} value={s.name}>{s.name}</option>
              ))}
            </select>
            <div className="flex gap-3 mt-5">
              <button onClick={moveFile} disabled={!moveTo}
                className="flex-1 bg-[#4A1A6B] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#2D0F42] disabled:opacity-50">ย้าย</button>
              <button onClick={() => setMoveTarget(null)}
                className="flex-1 border border-gray-300 py-2 rounded-lg text-sm text-[#6b6478] hover:bg-[#f7f5fa]">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
