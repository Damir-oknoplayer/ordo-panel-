import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createClient();
  const { data } = await supabase.from('labels').select('*').order('name');
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { name, color } = await req.json();
  const { data, error } = await supabase.from('labels').insert({ name, color }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient();
  const { id } = await req.json();
  const { error } = await supabase.from('labels').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
