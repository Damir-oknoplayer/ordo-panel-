import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendText, sendPhoto, sendDocument, sendVoice, isBlockedError } from '@/lib/telegram';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const body = await req.json();
  const { dialogId, text, fileUrl, fileName, contentType, replyToTelegramMessageId, replyToMessageId } = body;

  const admin = createAdminClient();
  const { data: dialog } = await admin.from('dialogs').select('*').eq('id', dialogId).single();
  if (!dialog) return NextResponse.json({ error: 'Диалог не найден' }, { status: 404 });

  // Сначала создаём запись со статусом "sending" — если отправка в Telegram упадёт,
  // сотрудник увидит именно эту запись с ошибкой, а не тишину
  const { data: message } = await admin.from('messages').insert({
    dialog_id: dialogId,
    sender_type: 'staff',
    staff_id: user.id,
    content_type: contentType || 'text',
    text_body: text || null,
    file_url: fileUrl || null,
    file_name: fileName || null,
    reply_to_message_id: replyToMessageId || null,
    send_status: 'sending'
  }).select().single();

  try {
    let tgResult;
    if (contentType === 'voice' && fileUrl) {
      tgResult = await sendVoice(dialog.telegram_chat_id, fileUrl, text);
    } else if (contentType === 'photo' && fileUrl) {
      tgResult = await sendPhoto(dialog.telegram_chat_id, fileUrl, text);
    } else if (contentType === 'document' && fileUrl) {
      tgResult = await sendDocument(dialog.telegram_chat_id, fileUrl, text);
    } else {
      tgResult = await sendText(dialog.telegram_chat_id, text, replyToTelegramMessageId);
    }

    await admin.from('messages').update({
      send_status: 'sent',
      telegram_message_id: tgResult.message_id,
      error_message: null
    }).eq('id', message.id);

    await admin.from('dialogs').update({
      last_message_preview: (text || (contentType === 'voice' ? '🎤 Голосовое' : 'Файл')).slice(0, 120),
      last_message_at: new Date().toISOString()
    }).eq('id', dialogId);

    return NextResponse.json({ ok: true, messageId: message.id });
  } catch (err: any) {
    const blocked = isBlockedError(err);
    await admin.from('messages').update({
      send_status: 'failed',
      error_message: blocked ? 'Клиент заблокировал бота' : (err.telegramDescription || err.message)
    }).eq('id', message.id);

    if (blocked) {
      await admin.from('dialogs').update({ is_bot_blocked: true }).eq('id', dialogId);
    }

    return NextResponse.json(
      { ok: false, error: blocked ? 'Клиент заблокировал бота' : (err.telegramDescription || 'Не удалось отправить сообщение') },
      { status: 200 } // 200, чтобы фронт получил и красиво показал ошибку, а не упал
    );
  }
}
