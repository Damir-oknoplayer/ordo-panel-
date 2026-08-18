import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { forwardTelegramMessage, sendPhoto, sendDocument, sendText } from '@/lib/telegram';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const { messageId, targetDialogId } = await req.json();
  const admin = createAdminClient();

  const { data: message } = await admin
    .from('messages')
    .select('*, dialogs(telegram_chat_id, client_name)')
    .eq('id', messageId)
    .single();
  const { data: targetDialog } = await admin.from('dialogs').select('*').eq('id', targetDialogId).single();
  if (!message || !targetDialog) return NextResponse.json({ error: 'Не найдено' }, { status: 404 });

  const sourceChatId = (message as any).dialogs?.telegram_chat_id;
  const sourceName = (message as any).dialogs?.client_name || 'диалог';

  try {
    let tgResult;

    if (message.telegram_message_id && sourceChatId) {
      // Настоящая пересылка — Telegram сам поставит пометку "Переслано" у клиента
      tgResult = await forwardTelegramMessage(
        targetDialog.telegram_chat_id,
        sourceChatId,
        message.telegram_message_id
      );
    } else {
      // Запасной путь: у сообщения нет telegram_message_id (например, внутренняя заметка).
      // Отправляем содержимое обычным способом.
      if (message.content_type === 'photo' && message.file_url) {
        tgResult = await sendPhoto(targetDialog.telegram_chat_id, message.file_url, message.text_body || undefined);
      } else if (message.content_type === 'document' && message.file_url) {
        tgResult = await sendDocument(targetDialog.telegram_chat_id, message.file_url, message.text_body || undefined);
      } else {
        tgResult = await sendText(targetDialog.telegram_chat_id, message.text_body || '');
      }
    }

    await admin.from('messages').insert({
      dialog_id: targetDialogId,
      sender_type: 'staff',
      staff_id: user.id,
      content_type: message.content_type,
      text_body: message.text_body,
      file_url: message.file_url,
      file_name: message.file_name,
      telegram_message_id: tgResult.message_id,
      is_forwarded: true,
      forwarded_from: sourceName,
      send_status: 'sent'
    });

    const preview = message.text_body || (message.content_type === 'photo' ? '📷 Фото' : '📎 Файл');
    await admin.from('dialogs').update({
      last_message_preview: preview.slice(0, 120),
      last_message_at: new Date().toISOString()
    }).eq('id', targetDialogId);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.telegramDescription || 'Не удалось переслать' }, { status: 200 });
  }
}
