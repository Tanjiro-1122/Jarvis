import { getSupabaseClient } from "@/lib/supabase";

export type SecurityEventOutcome = "success" | "failure" | "blocked" | "info";

export interface SecurityEventInput {
  eventType: string;
  outcome: SecurityEventOutcome;
  ipAddress?: string | null;
  userAgent?: string | null;
  sessionNonce?: string | null;
  metadata?: Record<string, unknown>;
}

export function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwardedFor ||
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

export async function logSecurityEvent(event: SecurityEventInput): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    await supabase.from("jarvis_security_events").insert({
      event_type: event.eventType,
      outcome: event.outcome,
      ip_address: event.ipAddress ?? null,
      user_agent: event.userAgent ?? null,
      session_nonce: event.sessionNonce ?? null,
      metadata: event.metadata ?? {},
    });
  } catch {
    // Security logging must never break auth or chat flow.
  }
}
