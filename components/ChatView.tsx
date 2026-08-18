'use client';

import { useEffect, useRef, useState } from 'react';
import { Message } from '@/lib/types';

export default function ChatView({
  messages, userId, onEdit, onDelete, onForward, onReply
}: {
  messages: Message[];
  userId: string;
  onEdit: (m: Message) => void;
  onDelete: (m: Message) => void;
  onForward: (m: Message) => void;
  onReply: (m: Message) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(40);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const visible = messages.slice(Math.max(0, messages.length - visibleCount));
  const byId = Object.fromEntries(messages.map((m) => [m.id, m]));

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}
      onScroll={(e) => {
        if (e.currentTarget.scrollTop < 60 && visibleCount < messages.length) {
          setVisibleCount((c) => Math.min(c + 40, messages.length));
        }
      }}
    >
      {visibleCount < messages.length && (
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-dim)' }}>Прокрутите вверх для более старых сообщений…</div>
      )}
      {visible.map((m) => {
        const mine = m.sender_type === 'staff';
        const quoted = m.reply_to_message_id ? byId[m.reply_to_message_id] : null;
        return (
          <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '65%' }}>
            <div style={{
              background: m.is_internal_note ? 'var(--warn-dim)' : mine ? 'var(--accent-dim)' : 'var(--panel)',
              border: `1px solid ${m.is_internal_note ? 'var(--warn)' : 'var(--border)'}`,
              borderRadius: 12, padding: '8px 12px', fontSize: 13.5, opacity: m.is_deleted ? 0.5 : 1
            }}>
              {m.is_internal_note && <div style={{ fontSize: 10.5, color: 'var(--warn)', fontWeight: 700, marginBottom: 2 }}>ВНУТРЕННЯЯ ЗАМЕТКА</div>}
              {m.is_forwarded && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  ↪ Переслано{m.forwarded_from ? ` из «${m.forwarded_from}»` : ''}
                </div>
              )}
              {quoted && (
                <div style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 8, marginBottom: 6, fontSize: 12, color: 'var(--text-dim)' }}>
                  {quoted.text_body?.slice(0, 80) || 'вложение'}
                </div>
              )}
              {m.is_deleted ? (
                <i style={{ color: 'var(--text-dim)' }}>сообщение удалено</i>
              ) : (
                <>
                  {m.content_type === 'photo' && m.file_url && (
                    <img src={m.file_url} alt="" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: m.text_body ? 6 : 0 }} />
                  )}
                  {m.content_type === 'document' && m.file_url && (
                    <a href={m.file_url} target="_blank" rel="noreferrer" style={{ display: 'block', marginBottom: m.text_body ? 6 : 0 }}>
                      📎 {m.file_name || 'Скачать файл'}
                    </a>
                  )}
                  {m.content_type === 'voice' && m.file_url && (
                    <audio controls src={m.file_url} style={{ marginBottom: m.text_body ? 6 : 0, maxWidth: '100%' }} />
                  )}
                  {m.text_body && <div style={{ whiteSpace: 'pre-wrap' }}>{m.text_body}</div>}
                </>
              )}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>
                  {new Date(m.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </span>
                {m.send_status === 'sending' && <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>отправка…</span>}
                {m.send_status === 'failed' && <span style={{ fontSize: 10.5, color: 'var(--danger)' }} title={m.error_message || ''}>⚠ не отправлено</span>}
              </div>
              {m.error_message && m.send_status === 'failed' && (
                <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 2 }}>{m.error_message}</div>
              )}
            </div>
            {!m.is_deleted && (
              <div style={{ display: 'flex', gap: 8, fontSize: 11, marginTop: 3, color: 'var(--text-dim)', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                <button onClick={() => onReply(m)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>ответить</button>
                <button onClick={() => onForward(m)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>переслать</button>
                {mine && m.content_type === 'text' && m.telegram_message_id && (
                  <button onClick={() => onEdit(m)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>изменить</button>
                )}
                {mine && m.telegram_message_id && (
                  <button onClick={() => onDelete(m)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}>удалить</button>
                )}
              </div>
            )}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
