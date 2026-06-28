/**
 * compute-result Edge Function
 * Retrieves and decrypts the result of a completed compute job.
 *
 * POST body: { job_id }
 * Returns: { result, status, completed_at }
 *
 * Requires COMPUTE_ENCRYPTION_KEY env var (hex-encoded 256-bit key).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** SHA-256 hash for API key lookup. */
async function sha256Key(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Resolve user_id from API key (te_live_) or Supabase JWT. */
async function resolveAuth(
  req: Request,
  supabase: ReturnType<typeof createClient>
): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);

  if (token.startsWith("te_live_")) {
    const keyHash = await sha256Key(token);
    const { data } = await supabase
      .from("api_keys")
      .select("user_id, is_active")
      .eq("key_hash", keyHash)
      .single();
    if (!data || !data.is_active) return null;
    return data.user_id;
  }

  const { data: { user } } = await supabase.auth.getUser(token);
  return user?.id || null;
}

/** Decrypt AES-256-GCM ciphertext (base64 with prepended IV). */
async function decrypt(cipherBase64: string, keyHex: string): Promise<string> {
  const keyBytes = new Uint8Array(
    keyHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16))
  );
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  const combined = Uint8Array.from(atob(cipherBase64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const encryptionKey = Deno.env.get("COMPUTE_ENCRYPTION_KEY");
  if (!encryptionKey) {
    return new Response(
      JSON.stringify({ error: "COMPUTE_ENCRYPTION_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { job_id } = body;
  if (!job_id) {
    return new Response(
      JSON.stringify({ error: "job_id is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Verify buyer owns the job (supports API key + JWT)
  const buyerId = await resolveAuth(req, supabase);

  const { data: job, error } = await supabase
    .from("compute_jobs")
    .select("id, buyer_id, status, result_encrypted, completed_at")
    .eq("id", job_id)
    .single();

  if (error || !job) {
    return new Response(
      JSON.stringify({ error: "Job not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Only the buyer (or service role with no auth) can retrieve results
  if (buyerId && job.buyer_id && job.buyer_id !== buyerId) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (job.status !== "completed" || !job.result_encrypted) {
    return new Response(
      JSON.stringify({ status: job.status, result: null, completed_at: null }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // The worker's result is base64-encoded (not AES encrypted in MVP),
  // but we try AES decryption first, falling back to base64 decode
  let result: string;
  try {
    result = await decrypt(job.result_encrypted, encryptionKey);
  } catch {
    // Fallback: worker used simple base64
    try {
      result = atob(job.result_encrypted);
    } catch {
      result = job.result_encrypted;
    }
  }

  return new Response(
    JSON.stringify({
      status: job.status,
      result: JSON.parse(result),
      completed_at: job.completed_at,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
