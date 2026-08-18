import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendText, sendPhoto, sendDocument } from '@/lib/telegram';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const { messageId, targetDialogId } = await req.json();
  const admin = createAdminClient();

  const { data: message } = await admin.from('messages').select('*').eq('id', messageId).single();
  const { data: targetDialog } = await admin.from('dialogs').select('*').eq('id', targetDialogId).single();
  if (!message || !targetDialog) return NextResponse.json({ error: 'Не найдено' }, { status: 404 });

  const label = 'Переслано';
  const text = message.text_body ? `${label}:\n${message.text_body}` : label;

  try {
    let tgResult;
    if (message.content_type === 'photo' && message.file_url) {
      tgResult = await sendPhoto(targetDialog.telegram_chat_id, message.file_url, text);
    } else if (message.content_type === 'document' && message.file_url) {
      tgResult = await sendDocument(targetDialog.telegram_chat_id, message.file_url, text);
    } else {
      tgResult = await sendText(targetDialog.telegram_chat_id, text);
    }

    await admin.from('messages').insert({
      dialog_id: targetDialogId,
      sender_type: 'staff',
      staff_id: user.id,
      content_type: message.content_type,
      text_body: text,
      file_url: message.file_url,
      file_name: message.file_name,
      telegram_message_id: tgResult.message_id,
      send_status: 'sent'
    });

    await admin.from('dialogs').update({
      last_message_preview: text.slice(0, 120),
      last_message_at: new Date().toISOString()
    }).eq('id', targetDialogId);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.telegramDescription || 'Не удалось переслать' }, { status: 200 });
  }
}
