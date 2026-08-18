const TG_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function tgCall(method: string, body: Record<string, any>) {
  const res = await fetch(`${TG_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!data.ok) {
    // Telegram возвращает описание ошибки в data.description —
    // прокидываем его наверх, чтобы сотрудник видел причину, а не просто "не отправилось"
    const err: any = new Error(data.description || 'Telegram API error');
    err.telegramErrorCode = data.error_code;
    err.telegramDescription = data.description;
    throw err;
  }
  return data.result;
}

export async function sendText(chatId: number, text: string, replyToMessageId?: number) {
  return tgCall('sendMessage', {
    chat_id: chatId,
    text,
    reply_to_message_id: replyToMessageId
  });
}

export async function sendPhoto(chatId: number, photoUrl: string, caption?: string) {
  return tgCall('sendPhoto', { chat_id: chatId, photo: photoUrl, caption });
}

export async function sendDocument(chatId: number, docUrl: string, caption?: string) {
  return tgCall('sendDocument', { chat_id: chatId, document: docUrl, caption });
}

export async function editMessageText(chatId: number, messageId: number, text: string) {
  return tgCall('editMessageText', { chat_id: chatId, message_id: messageId, text });
}

export async function deleteTelegramMessage(chatId: number, messageId: number) {
  return tgCall('deleteMessage', { chat_id: chatId, message_id: messageId });
}

// Настоящая пересылка средствами Telegram — у клиента отобразится
// системная пометка "Переслано", а не приписка в тексте.
export async function forwardTelegramMessage(toChatId: number, fromChatId: number, messageId: number) {
  return tgCall('forwardMessage', {
    chat_id: toChatId,
    from_chat_id: fromChatId,
    message_id: messageId
  });
}

// Telegram хранит файлы по временным ссылкам (file_path истекает) —
// поэтому при получении файла от клиента мы сразу скачиваем его
// и перезаливаем в собственное хранилище (Supabase Storage).
export async function getTelegramFileUrl(fileId: string): Promise<string> {
  const res = await fetch(`${TG_API}/getFile?file_id=${fileId}`);
  const data = await res.json();
  if (!data.ok) throw new Error('Не удалось получить файл из Telegram');
  const filePath = data.result.file_path;
  return `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;
}

export function isBlockedError(err: any): boolean {
  const desc = (err?.telegramDescription || '').toLowerCase();
  return desc.includes('blocked') || desc.includes('deactivated') || desc.includes('chat not found');
}
