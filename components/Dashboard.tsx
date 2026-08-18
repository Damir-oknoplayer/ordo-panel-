'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Dialog, Message, CannedReply, Label } from '@/lib/types';
import DialogList from './DialogList';
import ChatView from './ChatView';
import Composer from './Composer';
import SidePanel from './SidePanel';

export default function DashboardClient({ userId, userEmail, userName }: { userId: string; userEmail: string; userName: string }) {
  const supabase = createClient();
  const [dialogs, setDialogs] = useState<Dialog[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cannedReplies, setCannedReplies] = useState<CannedReply[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [replyTo, setReplyTo] = useState<{ id: number; preview: string } | null>(null);
  const [replyToMsgId, setReplyToMsgId] = useState<string | null>(null);
  const [noteMode, setNoteMode] = useState(false);

  const activeDialog = dialogs.find((d) => d.id === activeId) || null;
  const [dueReminders, setDueReminders] = useState<any[]>([]);

  useEffect(() => {
    async function check() {
      const res = await fetch('/api/reminders');
      const all = await res.json();
      const now = Date.now();
      setDueReminders(all.filter((r: any) => new Date(r.remind_at).getTime() <= now));
    }
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  async function dismissReminder(id: string) {
    await fetch('/api/reminders', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setDueReminders((prev) => prev.filter((r) => r.id !== id));
  }

  // Первичная загрузка
  useEffect(() => {
    (async () => {
      const { data: d } = await supabase.from('dialogs').select('*').order('last_message_at', { ascending: false });
      setDialogs(d || []);
      const { data: c } = await supabase.from('canned_replies').select('*').order('shortcut');
      setCannedReplies(c || []);
      const { data: l } = await supabase.from('labels').select('*').order('name');
      setLabels(l || []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Реальное время: диалоги
  useEffect(() => {
    const channel = supabase
      .channel('dialogs-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dialogs' }, (payload) => {
        setDialogs((prev) => {
          if (payload.eventType === 'INSERT') return [payload.new as Dialog, ...prev];
          if (payload.eventType === 'UPDATE') return prev.map((d) => (d.id === (payload.new as Dialog).id ? (payload.new as Dialog) : d));
          if (payload.eventType === 'DELETE') return prev.filter((d) => d.id !== (payload.old as Dialog).id);
          return prev;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Реальное время: сообщения активного диалога
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    (async () => {
      const { data } = await supabase.from('messages').select('*').eq('dialog_id', activeId).order('created_at').limit(500);
      setMessages(data || []);
    })();

    const channel = supabase
      .channel(`messages-${activeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `dialog_id=eq.${activeId}` }, (payload) => {
        setMessages((prev) => {
          if (payload.eventType === 'INSERT') return [...prev, payload.new as Message];
          if (payload.eventType === 'UPDATE') return prev.map((m) => (m.id === (payload.new as Message).id ? (payload.new as Message) : m));
          return prev;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const selectDialog = useCallback(async (id: string) => {
    setActiveId(id);
    setReplyTo(null);
    setReplyToMsgId(null);
    setNoteMode(false);
    const dialog = dialogs.find((d) => d.id === id);
    if (dialog && dialog.unread_count > 0) {
      await supabase.from('dialogs').update({ unread_count: 0 }).eq('id', id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogs]);

  async function handleSend({ text, files }: { text: string; files: { url: string; name: string; type: 'photo' | 'document' }[] }) {
    if (!activeDialog) return;

    if (noteMode) {
      await supabase.from('messages').insert({
        dialog_id: activeDialog.id, sender_type: 'staff', staff_id: userId,
        content_type: 'text', text_body: text, is_internal_note: true, send_status: 'sent'
      });
      return;
    }

    if (files.length === 0) {
      await fetch('/api/messages/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dialogId: activeDialog.id, text, contentType: 'text', replyToTelegramMessageId: replyTo?.id })
      });
    } else {
      for (const f of files) {
        await fetch('/api/messages/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dialogId: activeDialog.id, text, fileUrl: f.url, fileName: f.name, contentType: f.type })
        });
      }
    }
    setReplyTo(null);
    setReplyToMsgId(null);
  }

  async function handleDraftChange(text: string) {
    if (!activeDialog) return;
    await supabase.from('dialogs').update({ draft_text: text || null }).eq('id', activeDialog.id);
  }

  async function handleEdit(m: Message) {
    const newText = prompt('Новый текст сообщения:', m.text_body || '');
    if (newText === null || newText === m.text_body) return;
    const res = await fetch('/api/messages/edit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: m.id, newText })
    });
    const data = await res.json();
    if (!data.ok) alert(data.error || 'Не удалось изменить сообщение');
  }

  async function handleDelete(m: Message) {
    if (!confirm('Удалить сообщение у клиента в Telegram?')) return;
    const res = await fetch('/api/messages/delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: m.id })
    });
    const data = await res.json();
    if (!data.ok) alert(data.error || 'Не удалось удалить сообщение');
  }

  async function handleForward(m: Message) {
    const target = dialogs.find((d) => d.id !== activeId);
    const name = prompt('Введите имя клиента, куда переслать (как в списке диалогов):');
    if (!name) return;
    const targetDialog = dialogs.find((d) => d.client_name.toLowerCase().includes(name.toLowerCase()));
    if (!targetDialog) { alert('Диалог не найден'); return; }
    const res = await fetch('/api/messages/forward', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: m.id, targetDialogId: targetDialog.id })
    });
    const data = await res.json();
    if (!data.ok) alert(data.error || 'Не удалось переслать');
  }

  function handleReply(m: Message) {
    if (!m.telegram_message_id) return;
    setReplyTo({ id: m.telegram_message_id, preview: m.text_body || 'вложение' });
  }

  async function handleClaim(action: 'claim' | 'release') {
    if (!activeDialog) return;
    await fetch('/api/dialogs/claim', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dialogId: activeDialog.id, action })
    });
  }

  async function handleClose(status: 'closed' | 'waiting') {
    if (!activeDialog) return;
    await fetch('/api/dialogs/close', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dialogId: activeDialog.id, status })
    });
  }

  return (
    <div style={{ display: 'flex', height: '100vh', flexDirection: 'column' }}>
      {dueReminders.length > 0 && (
        <div style={{ background: 'var(--warn-dim)', borderBottom: '1px solid var(--warn)', padding: '8px 16px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {dueReminders.map((r) => (
            <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
              <span>⏰ Напоминание: <b>{r.dialogs?.client_name}</b>{r.note ? ` — ${r.note}` : ''}</span>
              <button className="btn" style={{ padding: '2px 8px' }} onClick={() => { selectDialog(r.dialog_id); dismissReminder(r.id); }}>Открыть</button>
              <button className="btn" style={{ padding: '2px 8px' }} onClick={() => dismissReminder(r.id)}>Скрыть</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <DialogList dialogs={dialogs} activeId={activeId} onSelect={selectDialog} userId={userId} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {activeDialog ? (
          <>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--panel)' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{activeDialog.client_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  {activeDialog.client_username ? `@${activeDialog.client_username}` : `id ${activeDialog.telegram_chat_id}`}
                  {activeDialog.assigned_to === userId && ' · в работе у вас'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={() => setNoteMode((v) => !v)} style={{ color: noteMode ? 'var(--warn)' : undefined, borderColor: noteMode ? 'var(--warn)' : undefined }}>
                  {noteMode ? '📝 режим заметки' : '📝 заметка'}
                </button>
                {activeDialog.assigned_to === userId ? (
                  <button className="btn" onClick={() => handleClaim('release')}>Снять с себя</button>
                ) : (
                  <button className="btn" onClick={() => handleClaim('claim')}>Взять в работу</button>
                )}
                {activeDialog.status !== 'closed' ? (
                  <button className="btn" onClick={() => handleClose('closed')}>Закрыть диалог</button>
                ) : (
                  <button className="btn" onClick={() => handleClose('waiting')}>Открыть заново</button>
                )}
              </div>
            </div>

            {activeDialog.is_bot_blocked && (
              <div style={{ background: 'var(--danger-dim)', color: 'var(--danger)', padding: '8px 16px', fontSize: 13 }}>
                ⚠ Клиент заблокировал бота — сообщения не доставляются
              </div>
            )}

            <ChatView messages={messages} userId={userId} onEdit={handleEdit} onDelete={handleDelete} onForward={handleForward} onReply={handleReply} />

            <Composer
              dialogId={activeDialog.id}
              initialDraft={activeDialog.draft_text || ''}
              cannedReplies={cannedReplies}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              onSend={handleSend}
              onDraftChange={handleDraftChange}
            />
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
            Выберите диалог слева
          </div>
        )}
      </div>

      <SidePanel
        userName={userName}
        cannedReplies={cannedReplies}
        labels={labels}
        activeDialog={activeDialog}
        messages={messages}
        onCannedRepliesChange={setCannedReplies}
        onLabelsChange={setLabels}
      />
      </div>
    </div>
  );
}
