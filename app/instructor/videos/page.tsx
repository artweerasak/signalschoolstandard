'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

interface VideoFile {
  name: string;
  size: number;
  url: string;
  modified: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function getCookie(name: string) {
  const v = document.cookie.match('(^|;) ?' + name + '=([^;]*)(;|$)');
  return v ? v[2] : null;
}

export default function VideosPage() {
  const [files, setFiles] = useState<VideoFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [copiedName, setCopiedName] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(async () => {
    try {
      const res = await fetch('/military/api/v1/videos/', { credentials: 'include' });
      const data = await res.json();
      setFiles(data.files || []);
    } catch {
      setError('ไม่สามารถโหลดรายการไฟล์ได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const uploadFile = (file: File) => {
    setUploading(true);
    setProgress(0);
    setUploadedBytes(0);
    setTotalBytes(file.size);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        setUploadedBytes(e.loaded);
        setProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.addEventListener('load', () => {
      setUploading(false);
      if (xhr.status === 200) {
        const result = JSON.parse(xhr.responseText);
        if (result.success) {
          loadFiles();
        } else {
          setError(result.error || 'อัพโหลดไม่สำเร็จ');
        }
      } else {
        setError('เกิดข้อผิดพลาด: ' + xhr.status);
      }
    });
    xhr.addEventListener('error', () => {
      setUploading(false);
      setError('เกิดข้อผิดพลาดระหว่างการอัพโหลด');
    });

    xhr.open('POST', '/military/api/v1/videos/upload/');
    xhr.setRequestHeader('X-CSRFToken', getCookie('csrftoken') || '');
    xhr.withCredentials = true;
    xhr.send(formData);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = '';
  };

  const deleteFile = async (filename: string) => {
    if (!confirm('ลบไฟล์ "' + filename + '" ใช่ไหม?')) return;
    const res = await fetch('/military/api/v1/videos/' + encodeURIComponent(filename) + '/', {
      method: 'DELETE',
      headers: { 'X-CSRFToken': getCookie('csrftoken') || '' },
      credentials: 'include',
    });
    if (res.ok) {
      loadFiles();
    } else {
      setError('ลบไฟล์ไม่สำเร็จ');
    }
  };

  const copyUrl = (filename: string, url: string) => {
    const fullUrl = 'https://signalstandard.rta.mi.th' + url;
    navigator.clipboard.writeText(fullUrl);
    setCopiedName(filename);
    setTimeout(() => setCopiedName(''), 2000);
  };

  const dropClass = dragging
    ? 'border-blue-500 bg-blue-50'
    : uploading
    ? 'border-yellow-400 bg-yellow-50 cursor-not-allowed'
    : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50';

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">จัดการวิดีโอการสอน</h1>
        <p className="text-gray-500 mt-1 text-sm">อัพโหลดวิดีโอ แล้วนำ URL ไปใส่ใน edX Studio → Video Component</p>
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all mb-6 ' + dropClass}
      >
        {uploading ? (
          <div className="space-y-4">
            <div className="text-yellow-600 font-medium text-lg">กำลังอัพโหลด...</div>
            <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
              <div
                className="h-4 rounded-full transition-all duration-300 bg-gradient-to-r from-blue-500 to-blue-600"
                style={{ width: progress + '%' }}
              />
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>{formatSize(uploadedBytes)} / {formatSize(totalBytes)}</span>
              <span className="font-bold text-blue-600 text-xl">{progress}%</span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-4xl">🎬</div>
            <div className="text-gray-600 font-medium">ลากไฟล์วิดีโอมาวางที่นี่</div>
            <div className="text-gray-400 text-sm">หรือคลิกเพื่อเลือกไฟล์ (รองรับ .mp4, .mov, .avi, .mkv ฯลฯ)</div>
            <div className="text-blue-500 text-xs mt-1">ไม่จำกัดขนาดไฟล์</div>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-700">ไฟล์วิดีโอที่อัพโหลดแล้ว</h2>
          <span className="text-sm text-gray-500">{files.length} ไฟล์</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400">กำลังโหลด...</div>
        ) : files.length === 0 ? (
          <div className="p-8 text-center text-gray-400">ยังไม่มีไฟล์วิดีโอ</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {files.map((f) => (
              <div key={f.name} className="px-4 py-3 flex items-center gap-4 hover:bg-gray-50">
                <span className="text-2xl">🎬</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-800 truncate">{f.name}</div>
                  <div className="text-xs text-gray-400">{formatSize(f.size)} • {new Date(f.modified * 1000).toLocaleDateString('th-TH')}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => copyUrl(f.name, f.url)}
                    className={'text-xs px-3 py-1.5 rounded-lg font-medium transition-all ' + (copiedName === f.name ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-600 hover:bg-blue-100')}
                  >
                    {copiedName === f.name ? '✓ คัดลอกแล้ว' : '📋 คัดลอก URL'}
                  </button>
                  <button
                    onClick={() => deleteFile(f.name)}
                    className="text-xs px-3 py-1.5 rounded-lg text-red-500 hover:bg-red-50 font-medium transition-all"
                  >
                    ลบ
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 bg-blue-50 rounded-xl p-4 text-sm text-blue-800">
        <div className="font-semibold mb-2">วิธีใช้งานใน edX Studio:</div>
        <ol className="list-decimal list-inside space-y-1 text-blue-700">
          <li>อัพโหลดวิดีโอด้านบน แล้วกด <strong>คัดลอก URL</strong></li>
          <li>เปิด Studio → เข้าบทเรียน → เพิ่ม Component → <strong>Video</strong></li>
          <li>วาง URL ลงในช่อง Video URL แล้วบันทึก</li>
        </ol>
      </div>
    </div>
  );
}
