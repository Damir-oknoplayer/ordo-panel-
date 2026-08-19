'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog } from '@/lib/types';

const STATUS_LABEL: Record<string, string> = {
  new: 'Новый', waiting: 'Ждёт ответа', in_progress: 'В работе', closed: 'Закрыт'
};
const STATUS_COLOR: Record<string, string> = {
  new: 'var(--accent)', waiting: 'var(--warn)', in_progress: '#6366f1', closed: 'var(--text-dim)'
};

type FilterKey = 'all' | 'mine' | 'unread' | 'waiting' | 'closed';

export default function DialogList({
  dialogs, activeId, onSelect, userId
}: {
  dialogs: Dialog[]; activeId: string | null; onSelect: (id: string) => void; userId: string;
}) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [textMatchIds, setTextMatchIds] = useState<string[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Поиск по тексту переписки идёт на сервере, поэтому запрос отправляем
  // не на каждую букву, а с задержкой после того, как человек перестал печатать.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setTextMatchIds(null); setSearching(false); return; }

    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setTextMatchIds(Array.isArray(data.dialogIds) ? data.dialogIds : []);
      } catch {
        setTextMatchIds([]);
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query]);

  const filtered = useMemo(() => {
    let list = dialogs;
    if (filter === 'mine') list = list.filter((d) => d.assigned_to === userId);
    else if (filter === 'unread') list = list.filter((d) => d.unread_count > 0);
    else if (filter === 'waiting') list = list.filter((d) => d.status === 'waiting' || d.status === 'new');
    else if (filter === 'closed') list = list.filter((d) => d.status === 'closed');
    else list = list.filter((d) => d.status !== 'closed');

    const q = query.trim().toLowerCase();
    if (q) {
      // Диалог подходит, если совпало имя клиента ИЛИ текст внутри переписки
      list = list.filter((d) =>
        d.client_name.toLowerCase().includes(q) ||
        (textMatchIds ? textMatchIds.includes(d.id) : false)
      );
    }
    return [...list].sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
  }, [dialogs, filter, query, userId, textMatchIds]);

  return (
    <div style={{ width: 320, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--panel)' }}>
      <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
        <input
          placeholder="Поиск по имени и переписке…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
        />
        {searching && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>Ищем…</div>}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {(['all', 'mine', 'unread', 'waiting', 'closed'] as FilterKey[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="btn"
              style={{
                padding: '4px 10px', fontSize: 12,
                background: filter === f ? 'var(--accent-dim)' : 'var(--panel)',
                borderColor: filter === f ? 'var(--accent)' : 'var(--border)',
                color: filter === f ? 'var(--accent)' : 'var(--text)'
              }}
            >
              {{ all: 'Все', mine: 'Мои', unread: 'Непрочитанные', waiting: 'Ждут ответа', closed: 'Закрытые' }[f]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 && (
          <div style={{ padding: 20, color: 'var(--text-dim)', fontSize: 13, textAlign: 'center' }}>
            Ничего не найдено
          </div>
        )}
        {filtered.map((d) => (
          <button
            key={d.id}
            onClick={() => onSelect(d.id)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px',
              border: 'none', borderBottom: '1px solid var(--border)',
              background: d.id === activeId ? 'var(--accent-dim)' : 'transparent'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>{d.client_name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {new Date(d.last_message_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <span style={{
                fontSize: 12.5, color: 'var(--text-dim)', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200
              }}>
                {d.last_message_preview || '—'}
              </span>
              {d.unread_count > 0 && (
                <span className="badge" style={{ background: 'var(--accent)', color: 'white' }}>{d.unread_count}</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
              <span className="badge" style={{ background: 'transparent', border: `1px solid ${STATUS_COLOR[d.status]}`, color: STATUS_COLOR[d.status] }}>
                {STATUS_LABEL[d.status]}
              </span>
              {d.draft_text && <span style={{ fontSize: 11, color: 'var(--warn)' }}>черновик</span>}
              {d.is_bot_blocked && <span style={{ fontSize: 11, color: 'var(--danger)' }}>бот заблокирован</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
