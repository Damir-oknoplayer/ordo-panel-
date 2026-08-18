import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteTelegramMessage } from '@/lib/telegram';

// Telegram позволяет боту удалять свои сообщения в течение 48 часов.
// После этого срока Telegram вернёт ошибку — сотрудник должен это увидеть, а не решить, что всё ок.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const { messageId } = await req.json();
  const admin = createAdminClient();

  const { data: message } = await admin.from('messages').select('*, dialogs(telegram_chat_id)').eq('id', messageId).single();
  if (!message) return NextResponse.json({ error: 'Сообщение не найдено' }, { status: 404 });
  if (message.sender_type !== 'staff') {
    return NextResponse.json({ error: 'Можно удалять только свои сообщения' }, { status: 403 });
  }

  const hoursSinceSent = (Date.now() - new Date(message.created_at).getTime()) / 3600000;
  if (hoursSinceSent > 48) {
    return NextResponse.json({ ok: false, error: 'Прошло больше 48 часов — Telegram уже не позволяет удалить это сообщение у клиента' }, { status: 200 });
  }

  try {
    await deleteTelegramMessage((message as any).dialogs.telegram_chat_id, message.telegram_message_id);
    await admin.from('messages').update({ is_deleted: true }).eq('id', messageId);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.telegramDescription || 'Не удалось удалить сообщение в Telegram' }, { status: 200 });
  }
}
