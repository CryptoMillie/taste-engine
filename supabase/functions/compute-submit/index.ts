/**
 * compute-submit Edge Function
 * Accepts a job from a buyer, encrypts the payload, and inserts into compute_jobs.
 *
 * POST body: { job_type, payload, coins_reward?, max_duration_ms? }
 * Returns: { job_id }
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

/** Encrypt plaintext with AES-256-GCM using the provided key. */
async function encrypt(plaintext: string, keyHex: string): Promise<string> {
  const keyBytes = new Uint8Array(
    keyHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16))
  );
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  // Prepend IV to ciphertext, base64 encode
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

/** SHA-256 hash of plaintext. */
async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

  const { job_type, payload, coins_reward = 10, usdc_reward = 0.0005, max_duration_ms = 30000 } = body;

  if (!job_type || !payload) {
    return new Response(
      JSON.stringify({ error: "job_type and payload are required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!["inference", "embedding", "benchmark"].includes(job_type)) {
    return new Response(
      JSON.stringify({ error: "Invalid job_type" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const payloadStr = typeof payload === "string" ? payload : JSON.stringify(payload);
  const [payloadEncrypted, payloadHash] = await Promise.all([
    encrypt(payloadStr, encryptionKey),
    sha256(payloadStr),
  ]);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Extract buyer from API key or JWT
  const buyerId = await resolveAuth(req, supabase);

  const { data, error } = await supabase
    .from("compute_jobs")
    .insert({
      buyer_id: buyerId,
      job_type,
      payload_encrypted: payloadEncrypted,
      payload_hash: payloadHash,
      coins_reward,
      usdc_reward,
      max_duration_ms,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ job_id: data.id }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
