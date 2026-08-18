import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { editMessageText } from '@/lib/telegram';

// Telegram позволяет редактировать сообщения бота без ограничения по времени,
// но НЕ позволяет менять сообщения с файлами (photo/document) — только текстовые.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const { messageId, newText } = await req.json();
  const admin = createAdminClient();

  const { data: message } = await admin.from('messages').select('*, dialogs(telegram_chat_id)').eq('id', messageId).single();
  if (!message) return NextResponse.json({ error: 'Сообщение не найдено' }, { status: 404 });
  if (message.sender_type !== 'staff') {
    return NextResponse.json({ error: 'Можно редактировать только свои сообщения' }, { status: 403 });
  }
  if (message.content_type !== 'text') {
    return NextResponse.json({ error: 'Telegram не позволяет редактировать сообщения с файлами' }, { status: 400 });
  }

  try {
    await editMessageText((message as any).dialogs.telegram_chat_id, message.telegram_message_id, newText);
    await admin.from('messages').update({ text_body: newText }).eq('id', messageId);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.telegramDescription || 'Не удалось изменить сообщение в Telegram' }, { status: 200 });
  }
}
