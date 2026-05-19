import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCipheriv, randomBytes } from 'crypto';

// ONE-TIME MIGRATION — delete after use
const MIGRATION_SECRET = process.env.MIGRATION_SECRET!;
const VAULT_KEY_B64 = process.env.VAULT_ENCRYPTION_KEY!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!.replace('/rest/v1/', '').replace('/rest/v1', '');
const SUPABASE_KEY = process.env.RUNE_SUPABASE_SERVICE_ROLE_KEY!;
const B44_TOKEN = process.env.BASE44_SERVICE_TOKEN!;
const PHROURIO_APP_ID = '698530168894c6e66eafecda';

function encryptPassword(plaintext: string): { encrypted: string; iv: string } {
  const key = Buffer.from(VAULT_KEY_B64, 'base64');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext || '', 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encrypted: Buffer.concat([encrypted, authTag]).toString('base64'),
    iv: iv.toString('base64'),
  };
}

async function readB44Page(skip: number, limit = 200): Promise<any[]> {
  const res = await fetch(
    `https://base44.app/api/apps/${PHROURIO_APP_ID}/entities/Password?skip=${skip}&limit=${limit}`,
    { headers: { Authorization: `Bearer ${B44_TOKEN}`, 'app-id': PHROURIO_APP_ID } }
  );
  if (!res.ok) throw new Error(`B44 ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.records || data || [];
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body.secret !== MIGRATION_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  let total = 0;
  let errors = 0;
  const errMsgs: string[] = [];

  // Read all pages from Base44
  const allRecords: any[] = [];
  for (let skip = 0; skip <= 600; skip += 200) {
    try {
      const page = await readB44Page(skip, 200);
      if (!page.length) break;
      allRecords.push(...page);
      if (page.length < 200) break;
    } catch (e: any) {
      errMsgs.push(`read error skip=${skip}: ${e.message}`);
      break;
    }
  }

  // Encrypt and upsert in batches of 50
  const batches: any[][] = [];
  for (let i = 0; i < allRecords.length; i += 50) batches.push(allRecords.slice(i, i + 50));

  for (const batch of batches) {
    const rows = batch.map(r => {
      const { encrypted, iv } = encryptPassword(r.password || '');
      return {
        id: r.id,
        service_name: r.service_name || '',
        username: r.username || '',
        encrypted_password: encrypted,
        iv,
        url: r.url || '',
        category: r.category || 'Other',
        notes: r.notes || '',
        favorite: r.favorite || false,
        is_weak: r.is_weak || false,
      };
    });
    const { error } = await supabase.from('phrourio_vault').upsert(rows, { onConflict: 'id' });
    if (error) { errors++; errMsgs.push(error.message); } 
    else total += rows.length;
  }

  return NextResponse.json({ 
    success: true, 
    totalRead: allRecords.length,
    totalInserted: total,
    errors,
    errMsgs: errMsgs.slice(0, 5)
  });
}
