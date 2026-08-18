'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CannedReply, Dialog, Label, Message } from '@/lib/types';

type Tab = 'files' | 'canned' | 'labels' | 'reminders' | 'stats';

export default function SidePanel({
  userName, cannedReplies, labels, activeDialog, messages, onCannedRepliesChange, onLabelsChange
}: {
  userName: string;
  cannedReplies: CannedReply[];
  labels: Label[];
  activeDialog: Dialog | null;
  messages: Message[];
  onCannedRepliesChange: (v: CannedReply[]) => void;
  onLabelsChange: (v: Label[]) => void;
}) {
  const [tab, setTab] = useState<Tab>('files');
  const router = useRouter();
  const supabase = createClient();

  async function logout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const fileMessages = messages.filter((m) => m.file_url && !m.is_deleted);

  return (
    <div style={{ width: 280, borderLeft: '1px solid var(--border)', background: 'var(--panel)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{userName}</span>
        <button onClick={logout} className="btn" style={{ padding: '4px 8px', fontSize: 12 }}>Выйти</button>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
        {(['files', 'canned', 'labels', 'reminders', 'stats'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '8px 2px', border: 'none', borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
            background: 'none', color: tab === t ? 'var(--accent)' : 'var(--text-dim)', fontWeight: 600
          }}>
            {{ files: 'Файлы', canned: 'Заготовки', labels: 'Метки', reminders: 'Напоминания', stats: 'Статистика' }[t]}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {tab === 'files' && (
          !activeDialog ? <Empty text="Выберите диалог" /> : fileMessages.length === 0 ? <Empty text="Файлов пока нет" /> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {fileMessages.map((m) => (
                <a key={m.id} href={m.file_url!} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
                  {m.content_type === 'photo' ? (
                    <img src={m.file_url!} style={{ width: '100%', height: 70, objectFit: 'cover', borderRadius: 6 }} />
                  ) : (
                    <div style={{ height: 70, background: 'var(--bg)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                      {m.content_type === 'voice' ? '🎤' : '📎'}
                    </div>
                  )}
                  <div style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.file_name || 'файл'}
                  </div>
                </a>
              ))}
            </div>
          )
        )}

        {tab === 'canned' && <CannedRepliesTab items={cannedReplies} onChange={onCannedRepliesChange} />}
        {tab === 'labels' && <LabelsTab labels={labels} activeDialog={activeDialog} onChange={onLabelsChange} />}
        {tab === 'reminders' && <RemindersTab activeDialog={activeDialog} />}
        {tab === 'stats' && <StatsTab />}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ color: 'var(--text-dim)', fontSize: 12.5, textAlign: 'center', marginTop: 20 }}>{text}</div>;
}

function CannedRepliesTab({ items, onChange }: { items: CannedReply[]; onChange: (v: CannedReply[]) => void }) {
  const [shortcut, setShortcut] = useState('');
  const [body, setBody] = useState('');

  async function add() {
    if (!shortcut.trim() || !body.trim()) return;
    const res = await fetch('/api/canned-replies', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shortcut: shortcut.trim(), body: body.trim() })
    });
    const data = await res.json();
    if (data.id) { onChange([...items, data]); setShortcut(''); setBody(''); }
  }
  async function remove(id: string) {
    await fetch('/api/canned-replies', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    onChange(items.filter((c) => c.id !== id));
  }

  return (
    <div>
      <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginBottom: 8 }}>Наберите "/" в поле ввода, чтобы вставить</div>
      {items.map((c) => (
        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
          <div><b>/{c.shortcut}</b><div style={{ color: 'var(--text-dim)' }}>{c.body.slice(0, 40)}</div></div>
          <button onClick={() => remove(c.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)' }}>✕</button>
        </div>
      ))}
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input placeholder="команда (без /)" value={shortcut} onChange={(e) => setShortcut(e.target.value)} style={{ padding: 7, borderRadius: 6, border: '1px solid var(--border)', fontSize: 12.5 }} />
        <textarea placeholder="текст ответа" value={body} onChange={(e) => setBody(e.target.value)} rows={3} style={{ padding: 7, borderRadius: 6, border: '1px solid var(--border)', fontSize: 12.5 }} />
        <button className="btn btn-primary" onClick={add}>Добавить</button>
      </div>
    </div>
  );
}

function LabelsTab({ labels, activeDialog, onChange }: { labels: Label[]; activeDialog: Dialog | null; onChange: (v: Label[]) => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#0f6b5c');

  async function add() {
    if (!name.trim()) return;
    const res = await fetch('/api/labels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), color }) });
    const data = await res.json();
    if (data.id) { onChange([...labels, data]); setName(''); }
  }
  async function remove(id: string) {
    await fetch('/api/labels', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    onChange(labels.filter((l) => l.id !== id));
  }
  async function toggle(labelId: string) {
    if (!activeDialog) return;
    await fetch('/api/labels/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dialogId: activeDialog.id, labelId, action: 'add' }) });
  }

  return (
    <div>
      {activeDialog && <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginBottom: 8 }}>Нажмите на метку, чтобы применить к открытому диалогу</div>}
      {labels.map((l) => (
        <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' }}>
          <span onClick={() => toggle(l.id)} className="badge" style={{ background: l.color + '22', color: l.color, cursor: activeDialog ? 'pointer' : 'default' }}>{l.name}</span>
          <button onClick={() => remove(l.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)' }}>✕</button>
        </div>
      ))}
      <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
        <input placeholder="название" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, padding: 7, borderRadius: 6, border: '1px solid var(--border)', fontSize: 12.5 }} />
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 34 }} />
      </div>
      <button className="btn btn-primary" onClick={add} style={{ marginTop: 6, width: '100%' }}>Добавить метку</button>
    </div>
  );
}

function RemindersTab({ activeDialog }: { activeDialog: Dialog | null }) {
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');

  async function add() {
    if (!activeDialog || !when) return;
    await fetch('/api/reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dialogId: activeDialog.id, remindAt: when, note }) });
    setWhen(''); setNote('');
    alert('Напоминание создано');
  }

  if (!activeDialog) return <Empty text="Выберите диалог" />;
  return (
    <div>
      <div style={{ fontSize: 12.5, marginBottom: 8 }}>Напомнить по диалогу с {activeDialog.client_name}</div>
      <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ width: '100%', padding: 7, borderRadius: 6, border: '1px solid var(--border)', marginBottom: 6, fontSize: 12.5 }} />
      <input placeholder="заметка (необязательно)" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: '100%', padding: 7, borderRadius: 6, border: '1px solid var(--border)', marginBottom: 6, fontSize: 12.5 }} />
      <button className="btn btn-primary" onClick={add} style={{ width: '100%' }}>Создать напоминание</button>
    </div>
  );
}

function StatsTab() {
  const [stats, setStats] = useState<any>(null);
  useState(() => { fetch('/api/stats').then((r) => r.json()).then(setStats); });
  if (!stats) return <Empty text="Загрузка…" />;
  return (
    <div style={{ fontSize: 12.5 }}>
      <div style={{ marginBottom: 10, padding: 8, background: 'var(--accent-dim)', borderRadius: 8 }}>
        <b>{stats.waitingNow}</b> клиентов ждут ответа сейчас
      </div>
      {stats.perStaff.map((s: any) => (
        <div key={s.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600 }}>{s.name}</div>
          <div style={{ color: 'var(--text-dim)' }}>Сообщений: {s.messagesSent} · Диалогов: {s.dialogsHandled} · Закрыто: {s.dialogsClosed}</div>
        </div>
      ))}
    </div>
  );
}
