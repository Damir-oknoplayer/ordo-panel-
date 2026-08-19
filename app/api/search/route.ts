import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Поиск по тексту внутри переписки: возвращает id диалогов,
// в которых встречается искомая строка. Поиск по имени клиента
// делается на клиенте — там список уже загружен.
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ dialogIds: [] }, { status: 401 });

  const query = req.nextUrl.searchParams.get('q')?.trim();
  if (!query || query.length < 2) return NextResponse.json({ dialogIds: [] });

  const { data, error } = await supabase
    .from('messages')
    .select('dialog_id')
    .ilike('text_body', `%${query}%`)
    .limit(200);

  if (error) return NextResponse.json({ dialogIds: [], error: error.message });

  const dialogIds = Array.from(new Set((data || []).map((m) => m.dialog_id)));
  return NextResponse.json({ dialogIds }, { headers: { 'Cache-Control': 'no-store' } });
}
