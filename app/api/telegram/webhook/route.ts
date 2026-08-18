import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTelegramFileUrl } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Проверяем секретный токен, чтобы вебхук не мог дёрнуть кто попало
  const secretHeader = req.headers.get('x-telegram-bot-api-secret-token');
  if (secretHeader !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = await req.json();
  const supabase = createAdminClient();

  try {
    const msg = update.message || update.edited_message;
    if (!msg) {
      // Другие типы апдейтов (callback_query и т.п.) нам не нужны — бот не должен ничего решать сам
      return NextResponse.json({ ok: true });
    }

    const chatId: number = msg.chat.id;
    const clientName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || 'Без имени';
    const clientUsername = msg.from?.username || null;

    // Защита от дублей: Telegram может прислать одно и то же обновление дважды
    const { data: existingByUpdate } = await supabase
      .from('messages')
      .select('id')
      .eq('telegram_update_id', update.update_id)
      .maybeSingle();
    if (existingByUpdate) {
      return NextResponse.json({ ok: true });
    }

    // Находим диалог по chat_id или создаём новый
    let { data: dialog } = await supabase
      .from('dialogs')
      .select('*')
      .eq('telegram_chat_id', chatId)
      .maybeSingle();

    if (!dialog) {
      const { data: newDialog, error } = await supabase
        .from('dialogs')
        .insert({
          telegram_chat_id: chatId,
          client_name: clientName,
          client_username: clientUsername,
          status: 'new'
        })
        .select()
        .single();
      if (error) throw error;
      dialog = newDialog;
    }

    // Определяем тип содержимого и, если есть файл — перезаливаем его в своё хранилище
    let contentType: 'text' | 'photo' | 'document' | 'voice' = 'text';
    let textBody: string | null = msg.text || null;
    let fileUrl: string | null = null;
    let fileName: string | null = null;
    const caption: string | null = msg.caption || null;

    if (msg.photo && msg.photo.length > 0) {
      contentType = 'photo';
      const largest = msg.photo[msg.photo.length - 1];
      const tgUrl = await getTelegramFileUrl(largest.file_id);
      fileUrl = await reuploadToStorage(supabase, tgUrl, `photo_${Date.now()}.jpg`);
    } else if (msg.document) {
      contentType = 'document';
      fileName = msg.document.file_name || 'файл';
      const tgUrl = await getTelegramFileUrl(msg.document.file_id);
      fileUrl = await reuploadToStorage(supabase, tgUrl, fileName);
    } else if (msg.voice) {
      contentType = 'voice';
      const tgUrl = await getTelegramFileUrl(msg.voice.file_id);
      fileUrl = await reuploadToStorage(supabase, tgUrl, `voice_${Date.now()}.ogg`);
    }

    // Ответ на сообщение (цитата) — ищем исходное сообщение у нас в базе по telegram_message_id
    let replyToMessageId: string | null = null;
    if (msg.reply_to_message) {
      const { data: original } = await supabase
        .from('messages')
        .select('id')
        .eq('dialog_id', dialog.id)
        .eq('telegram_message_id', msg.reply_to_message.message_id)
        .maybeSingle();
      replyToMessageId = original?.id || null;
    }

    await supabase.from('messages').insert({
      dialog_id: dialog.id,
      sender_type: 'client',
      telegram_message_id: msg.message_id,
      telegram_update_id: update.update_id,
      content_type: contentType,
      text_body: textBody,
      file_url: fileUrl,
      file_name: fileName,
      caption,
      reply_to_message_id: replyToMessageId,
      send_status: 'sent'
    });

    const preview = textBody || caption || (contentType === 'photo' ? '📷 Фото' : contentType === 'document' ? '📎 Файл' : '🎤 Голосовое');

    await supabase
      .from('dialogs')
      .update({
        last_message_preview: preview.slice(0, 120),
        last_message_at: new Date().toISOString(),
        unread_count: (dialog.unread_count || 0) + 1,
        status: dialog.status === 'closed' ? 'new' : dialog.status, // закрытый диалог возвращается в активные
        is_bot_blocked: false
      })
      .eq('id', dialog.id);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Telegram webhook error:', err);
    // Telegram ждёт 200 даже при внутренней ошибке, иначе будет бесконечно ретраить —
    // но саму ошибку логируем, чтобы не терять сообщения молча
    return NextResponse.json({ ok: false, error: err.message }, { status: 200 });
  }
}

async function reuploadToStorage(supabase: any, sourceUrl: string, fileName: string): Promise<string> {
  const res = await fetch(sourceUrl);
  const blob = await res.arrayBuffer();
  const path = `${Date.now()}_${fileName}`.replace(/[^a-zA-Z0-9._-]/g, '_');
  const { error } = await supabase.storage.from('chat-files').upload(path, blob, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('chat-files').getPublicUrl(path);
  return data.publicUrl;
}
