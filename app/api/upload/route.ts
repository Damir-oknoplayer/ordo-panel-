import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Telegram ограничивает: фото до 10 МБ, документы до 50 МБ через прямую загрузку по URL.
// Проверяем размер ДО отправки, чтобы сотрудник видел понятную ошибку сразу, а не сбой после.
const MAX_SIZE = 45 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File;
  if (!file) return NextResponse.json({ error: 'Файл не передан' }, { status: 400 });

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: `Файл слишком большой (${(file.size / 1024 / 1024).toFixed(1)} МБ). Максимум 45 МБ.` }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const path = `${Date.now()}_${file.name}`.replace(/[^a-zA-Z0-9._-]/g, '_');

  const { error } = await supabase.storage.from('chat-files').upload(path, arrayBuffer, {
    contentType: file.type,
    upsert: true
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { data } = supabase.storage.from('chat-files').getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, name: file.name });
}
