import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const { dialogId, action } = await req.json(); // action: 'claim' | 'release'

  const { error } = await supabase
    .from('dialogs')
    .update({
      assigned_to: action === 'claim' ? user.id : null,
      status: action === 'claim' ? 'in_progress' : 'waiting'
    })
    .eq('id', dialogId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
