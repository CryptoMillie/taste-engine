/**
 * v1-chat-completions Edge Function
 * OpenAI-compatible /v1/chat/completions endpoint for external buyers and AI agents.
 *
 * Auth: Bearer te_live_... (API key) OR Supabase JWT
 * Request: { model?, messages, max_tokens?, temperature? }
 * Response: OpenAI-compatible chat completion
 *
 * Flow: validate auth → encrypt payload → insert job → poll for completion → return result
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** SHA-256 hash of a string, returned as hex. */
async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Encrypt plaintext with AES-256-GCM. */
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
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

/** Decrypt AES-256-GCM ciphertext. */
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

/** Resolve user_id from API key or JWT. Returns { userId, apiKeyId } or null. */
async function resolveAuth(
  req: Request,
  supabase: ReturnType<typeof createClient>
): Promise<{ userId: string; apiKeyId: string | null } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);

  // API key path
  if (token.startsWith("te_live_")) {
    const keyHash = await sha256(token);
    const { data, error } = await supabase
      .from("api_keys")
      .select("id, user_id, is_active")
      .eq("key_hash", keyHash)
      .single();

    if (error || !data || !data.is_active) return null;
    return { userId: data.user_id, apiKeyId: data.id };
  }

  // JWT path
  const {
    data: { user },
  } = await supabase.auth.getUser(token);
  if (!user) return null;
  return { userId: user.id, apiKeyId: null };
}

/** Sleep for ms. */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: { message: "Method not allowed", type: "invalid_request_error" } }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const encryptionKey = Deno.env.get("COMPUTE_ENCRYPTION_KEY");
  if (!encryptionKey) {
    return new Response(
      JSON.stringify({ error: { message: "Server misconfigured", type: "server_error" } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ── Auth ─────────────────────────────────────────────────────────
  const auth = await resolveAuth(req, supabase);
  if (!auth) {
    return new Response(
      JSON.stringify({
        error: {
          message: "Invalid API key or token. Use Bearer te_live_... or a Supabase JWT.",
          type: "authentication_error",
        },
      }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── Parse request ────────────────────────────────────────────────
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: { message: "Invalid JSON body", type: "invalid_request_error" } }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { messages, max_tokens = 512, temperature = 0.7, model } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(
      JSON.stringify({
        error: { message: "messages array is required", type: "invalid_request_error" },
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── Check workers online ─────────────────────────────────────────
  const { data: netStats } = await supabase.rpc("compute_network_stats");
  if (!netStats || (netStats.workers_online || 0) === 0) {
    return new Response(
      JSON.stringify({
        error: {
          message: "No workers available. Try again later.",
          type: "server_error",
        },
      }),
      {
        status: 503,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": "30",
        },
      }
    );
  }

  // ── Build + encrypt payload ──────────────────────────────────────
  const payloadStr = JSON.stringify({ messages, max_tokens, temperature });
  const [payloadEncrypted, payloadHash] = await Promise.all([
    encrypt(payloadStr, encryptionKey),
    sha256(payloadStr),
  ]);

  // ── Insert job ───────────────────────────────────────────────────
  const { data: jobData, error: insertErr } = await supabase
    .from("compute_jobs")
    .insert({
      buyer_id: auth.userId,
      job_type: "inference",
      payload_encrypted: payloadEncrypted,
      payload_hash: payloadHash,
      coins_reward: 10,
      usdc_reward: 0.001,
      max_duration_ms: 60000,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (insertErr || !jobData) {
    return new Response(
      JSON.stringify({ error: { message: "Failed to submit job", type: "server_error" } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const jobId = jobData.id;

  // ── Poll for completion ──────────────────────────────────────────
  const POLL_INTERVAL = 500;
  const TIMEOUT = 60000;
  const start = Date.now();

  while (Date.now() - start < TIMEOUT) {
    await sleep(POLL_INTERVAL);

    const { data: job } = await supabase
      .from("compute_jobs")
      .select("status, result_encrypted, completed_at")
      .eq("id", jobId)
      .single();

    if (!job) break;

    if (job.status === "completed" && job.result_encrypted) {
      // Decrypt result
      let resultStr: string;
      try {
        resultStr = await decrypt(job.result_encrypted, encryptionKey);
      } catch {
        try {
          resultStr = atob(job.result_encrypted);
        } catch {
          resultStr = job.result_encrypted;
        }
      }

      let result: any;
      try {
        result = JSON.parse(resultStr);
      } catch {
        result = { choices: [{ message: { role: "assistant", content: resultStr } }] };
      }

      // Update API key usage
      if (auth.apiKeyId) {
        const totalTokens = result.usage?.total_tokens || 0;
        await supabase.rpc("increment_api_key_usage", {
          p_key_id: auth.apiKeyId,
          p_tokens: totalTokens,
        }).catch(() => {
          // Fallback: direct update
          supabase
            .from("api_keys")
            .update({
              usage_count: supabase.rpc ? undefined : 0, // handled below
            })
            .eq("id", auth.apiKeyId);
        });

        // Direct increment as fallback
        const { data: keyData } = await supabase
          .from("api_keys")
          .select("usage_count, usage_tokens")
          .eq("id", auth.apiKeyId)
          .single();

        if (keyData) {
          await supabase
            .from("api_keys")
            .update({
              usage_count: (keyData.usage_count || 0) + 1,
              usage_tokens: (keyData.usage_tokens || 0) + totalTokens,
            })
            .eq("id", auth.apiKeyId);
        }
      }

      // Return OpenAI-compatible response
      const response = {
        id: result.id || `chatcmpl-${jobId}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: model || result.model || "taste-engine",
        choices: result.choices || [
          {
            index: 0,
            message: {
              role: "assistant",
              content: typeof result === "string" ? result : JSON.stringify(result),
            },
            finish_reason: "stop",
          },
        ],
        usage: result.usage || {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (job.status === "failed" || job.status === "expired") {
      return new Response(
        JSON.stringify({
          error: { message: `Job ${job.status}`, type: "server_error" },
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  // Timeout
  return new Response(
    JSON.stringify({
      error: {
        message: "Request timed out. Workers may be busy.",
        type: "server_error",
      },
    }),
    {
      status: 503,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": "10",
      },
    }
  );
});
