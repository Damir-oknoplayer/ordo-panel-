'use client';

import { useEffect, useRef, useState } from 'react';
import { CannedReply } from '@/lib/types';

const EMOJIS = ['😀','😊','👍','🙏','❤️','😂','🎉','👌','😔','🔥','✅','⏳','📎','📸'];

// Telegram не принимает HEIC как фото, а крупные снимки долго грузятся.
// Поэтому изображения приводим к JPEG и уменьшаем прямо в браузере через canvas.
const MAX_IMAGE_SIDE = 2000;
const JPEG_QUALITY = 0.85;
const MAX_FILE_SIZE = 45 * 1024 * 1024;

// Файл в очереди на отправку: сам файл, превью для показа и подпись сотрудника
interface PendingFile {
  file: File;
  previewUrl: string | null;
  caption: string;
}

function looksLikeImage(file: File): boolean {
  return file.type.startsWith('image/') || /\.hei[cf]$/i.test(file.name);
}

async function prepareImage(file: File): Promise<{ file: File; warning?: string }> {
  if (!looksLikeImage(file)) return { file };
  if (file.type === 'image/gif') return { file }; // при перерисовке потеряется анимация

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { file };
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    );
    if (!blob) return { file };

    const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return { file: new File([blob], newName, { type: 'image/jpeg' }) };
  } catch {
    return {
      file,
      warning: /\.hei[cf]$/i.test(file.name)
        ? `«${file.name}»: не удалось преобразовать HEIC, файл уйдёт как вложение.`
        : undefined
    };
  }
}

// Превью строим из уже подготовленного (сжатого) файла, чтобы сотрудник
// видел именно то, что уйдёт клиенту.
async function buildPreview(file: File): Promise<string | null> {
  if (!looksLikeImage(file)) return null;
  try {
    const { file: prepared } = await prepareImage(file);
    return URL.createObjectURL(prepared);
  } catch {
    return null;
  }
}

export default function Composer({
  dialogId, initialDraft, cannedReplies, replyTo, onCancelReply, onSend, onDraftChange
}: {
  dialogId: string;
  initialDraft: string;
  cannedReplies: CannedReply[];
  replyTo: { id: number; preview: string; messageId: string } | null;
  onCancelReply: () => void;
  onSend: (payload: { text: string; files: { url: string; name: string; type: 'photo' | 'document' | 'voice'; caption: string }[] }) => Promise<void>;
  onDraftChange: (text: string) => void;
}) {
  const [text, setText] = useState(initialDraft || '');
  const [showCanned, setShowCanned] = useState(false);
  const [cannedIndex, setCannedIndex] = useState(0);
  const [showEmoji, setShowEmoji] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => { setText(initialDraft || ''); }, [dialogId]);

  useEffect(() => {
    const t = setTimeout(() => onDraftChange(text), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // Освобождаем ссылки на превью, чтобы не копить их в памяти
  useEffect(() => {
    return () => {
      pendingFiles.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addFiles(incoming: File[]) {
    const errors: string[] = [];
    const accepted: PendingFile[] = [];

    for (const f of incoming) {
      if (f.size > MAX_FILE_SIZE) {
        errors.push(`«${f.name}»: файл ${(f.size / 1024 / 1024).toFixed(1)} МБ, максимум 45 МБ.`);
        continue;
      }
      const previewUrl = await buildPreview(f);
      accepted.push({ file: f, previewUrl, caption: '' });
    }

    if (accepted.length) setPendingFiles((prev) => [...prev, ...accepted]);
    setFileError(errors.length ? errors.join('\n') : null);
  }

  function removeFile(index: number) {
    setPendingFiles((prev) => {
      const target = prev[index];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  function setCaption(index: number, caption: string) {
    setPendingFiles((prev) => prev.map((p, i) => (i === index ? { ...p, caption } : p)));
  }

  const filteredCanned = cannedReplies.filter((c) =>
    c.shortcut.toLowerCase().includes(text.split('/').pop()?.toLowerCase() || '')
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showCanned) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setCannedIndex((i) => Math.min(i + 1, filteredCanned.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setCannedIndex((i) => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter') { e.preventDefault(); insertCanned(filteredCanned[cannedIndex]); return; }
      if (e.key === 'Escape') { setShowCanned(false); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleTextChange(v: string) {
    setText(v);
    setShowCanned(/\/\S*$/.test(v));
    setCannedIndex(0);
  }

  function insertCanned(reply: CannedReply) {
    if (!reply) return;
    const idx = text.lastIndexOf('/');
    setText(text.slice(0, idx) + reply.body);
    setShowCanned(false);
    textareaRef.current?.focus();
  }

  function insertEmoji(emoji: string) {
    const el = textareaRef.current;
    if (!el) { setText(text + emoji); return; }
    const start = el.selectionStart, end = el.selectionEnd;
    const newText = text.slice(0, start) + emoji + text.slice(end);
    setText(newText);
    setShowEmoji(false);
    setTimeout(() => { el.focus(); el.selectionStart = el.selectionEnd = start + emoji.length; }, 0);
  }

  function detectType(file: File): 'photo' | 'document' | 'voice' {
    if (file.type.startsWith('audio/')) return 'voice';
    if (file.type.startsWith('image/')) return 'photo';
    return 'document';
  }

  async function uploadFile(pending: PendingFile): Promise<{ result: { url: string; name: string; type: 'photo' | 'document' | 'voice'; caption: string } | null; warning?: string }> {
    const { file: prepared, warning } = await prepareImage(pending.file);
    const fd = new FormData();
    fd.append('file', prepared);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) return { result: null, warning: data.error || 'Ошибка загрузки файла' };
    return {
      result: { url: data.url, name: data.name, type: detectType(prepared), caption: pending.caption },
      warning
    };
  }

  async function handleSend() {
    if (!text.trim() && pendingFiles.length === 0) return;
    setSending(true);
    setFileError(null);
    try {
      const uploaded: { url: string; name: string; type: 'photo' | 'document' | 'voice'; caption: string }[] = [];
      const warnings: string[] = [];
      for (const p of pendingFiles) {
        const { result, warning } = await uploadFile(p);
        if (result) uploaded.push(result);
        if (warning) warnings.push(warning);
      }
      await onSend({ text: text.trim(), files: uploaded });
      setText('');
      pendingFiles.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
      setPendingFiles([]);
      onDraftChange('');
      if (warnings.length) setFileError(warnings.join('\n'));
    } finally {
      setSending(false);
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = ['audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4', 'audio/webm;codecs=opus'];
      const mimeType = preferred.find((t) => MediaRecorder.isTypeSupported(t));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        const actualType = recorder.mimeType || 'audio/ogg';
        const ext = actualType.includes('ogg') ? 'ogg' : actualType.includes('mp4') ? 'm4a' : 'webm';
        const blob = new Blob(chunksRef.current, { type: actualType });
        const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: actualType });
        setPendingFiles((prev) => [...prev, { file, previewUrl: null, caption: '' }]);
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      setFileError('Не удалось получить доступ к микрофону');
    }
  }
  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', background: 'var(--panel)', position: 'relative' }}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault(); setIsDragging(false);
        addFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {isDragging && (
        <div style={{
          position: 'absolute', inset: 0, background: 'var(--accent-dim)', border: '2px dashed var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5, fontSize: 13, color: 'var(--accent)'
        }}>
          Отпустите файл, чтобы прикрепить
        </div>
      )}

      {replyTo && (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 14px', background: 'var(--bg)', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
          <span>Ответ на: {replyTo.preview.slice(0, 60)}</span>
          <button onClick={onCancelReply} style={{ background: 'none', border: 'none', color: 'var(--text-dim)' }}>✕</button>
        </div>
      )}

      {fileError && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10,
          padding: '8px 14px', background: 'var(--warn-dim)', color: 'var(--warn)',
          fontSize: 12.5, borderBottom: '1px solid var(--warn)', whiteSpace: 'pre-wrap'
        }}>
          <span>⚠ {fileError}</span>
          <button onClick={() => setFileError(null)} style={{ background: 'none', border: 'none', color: 'var(--warn)', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {pendingFiles.length > 0 && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', maxHeight: 240, overflowY: 'auto' }}>
          <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginBottom: 8 }}>
            Будет отправлено ({pendingFiles.length}):
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingFiles.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--bg)', padding: 8, borderRadius: 8 }}>
                {p.previewUrl ? (
                  <img src={p.previewUrl} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                ) : (
                  <div style={{
                    width: 56, height: 56, borderRadius: 6, flexShrink: 0, background: 'var(--panel)',
                    border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22
                  }}>
                    {p.file.type.startsWith('audio/') ? '🎤' : '📎'}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.file.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>
                    {(p.file.size / 1024).toFixed(0)} КБ
                  </div>
                  <input
                    placeholder="Подпись к файлу (необязательно)"
                    value={p.caption}
                    onChange={(e) => setCaption(i, e.target.value)}
                    style={{ width: '100%', padding: '5px 7px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
                  />
                </div>
                <button onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 14 }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showCanned && filteredCanned.length > 0 && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 14, right: 14, background: 'var(--panel)',
          border: '1px solid var(--border)', borderRadius: 8, marginBottom: 4, maxHeight: 200, overflowY: 'auto', zIndex: 10
        }}>
          {filteredCanned.map((c, i) => (
            <div key={c.id} onClick={() => insertCanned(c)}
              style={{ padding: 8, cursor: 'pointer', background: i === cannedIndex ? 'var(--accent-dim)' : 'transparent', fontSize: 13 }}>
              <b>/{c.shortcut}</b> — <span style={{ color: 'var(--text-dim)' }}>{c.body.slice(0, 50)}</span>
            </div>
          ))}
        </div>
      )}

      {showEmoji && (
        <div style={{ position: 'absolute', bottom: '100%', right: 14, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: 8, display: 'flex', flexWrap: 'wrap', gap: 4, width: 200 }}>
          {EMOJIS.map((e) => <button key={e} onClick={() => insertEmoji(e)} style={{ border: 'none', background: 'none', fontSize: 18 }}>{e}</button>)}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'flex-end' }}>
        <label className="btn" style={{ padding: '8px 10px' }}>
          📎
          <input type="file" multiple hidden onChange={(e) => { addFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
        </label>
        <button className="btn" style={{ padding: '8px 10px' }} onClick={() => setShowEmoji((v) => !v)}>😊</button>
        <button
          className="btn" style={{ padding: '8px 10px', color: isRecording ? 'var(--danger)' : undefined }}
          onClick={isRecording ? stopRecording : startRecording}
        >
          {isRecording ? '⏹ стоп' : '🎤'}
        </button>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Напишите сообщение… (/ — заготовки)"
          rows={1}
          style={{ flex: 1, resize: 'none', padding: 10, borderRadius: 8, border: '1px solid var(--border)', maxHeight: 120 }}
        />
        <button className="btn btn-primary" disabled={sending} onClick={handleSend} style={{ padding: '10px 18px' }}>
          {sending ? '…' : 'Отправить'}
        </button>
      </div>
    </div>
  );
}
