import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createClient();
  const { data } = await supabase.from('canned_replies').select('*').order('shortcut');
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const { shortcut, body: replyBody } = await req.json();
  const { data, error } = await supabase
    .from('canned_replies')
    .insert({ shortcut, body: replyBody, created_by: user.id })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient();
  const { id } = await req.json();
  const { error } = await supabase.from('canned_replies').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
