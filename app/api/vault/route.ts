import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!.replace('/rest/v1/', '').replace('/rest/v1', ''),
  process.env.RUNE_SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get('rune:authenticated:v2');
  if (!cookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || '';
  const category = searchParams.get('category') || '';

  let query = supabase.from('phrourio_vault').select('id,service_name,username,encrypted_password,iv,url,category,notes,favorite,is_weak').order('service_name');

  if (search) query = query.ilike('service_name', `%${search}%`);
  if (category && category !== 'All') query = query.eq('category', category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Decrypt passwords server-side
  const { decryptVaultPassword } = await import('@/lib/vault');
  const decrypted = (data || []).map(item => ({
    ...item,
    password: decryptVaultPassword(item.encrypted_password, item.iv),
    encrypted_password: undefined,
    iv: undefined,
  }));

  return NextResponse.json({ items: decrypted, count: decrypted.length });
}
