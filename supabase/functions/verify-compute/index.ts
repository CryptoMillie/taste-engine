/**
 * verify-compute Edge Function
 * Async spot-check verification layer using Verathos (Bittensor SN96).
 *
 * Triggered by:
 *   - pg_cron every 2 minutes (empty body → batch sample)
 *   - POST { job_id } for on-demand single-job verification
 *
 * Env vars:
 *   VERATHOS_API_KEY          — API key for Verathos inference
 *   COMPUTE_ENCRYPTION_KEY    — AES-256-GCM key (hex) for payload/result decryption
 *   VERATHOS_SAMPLE_RATE      — fraction of completed jobs to verify (default 0.15)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Decrypt AES-256-GCM ciphertext (base64 with prepended 12-byte IV). */
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

/** Try AES decryption, fall back to base64, then raw string. */
async function safeDecrypt(encrypted: string, keyHex: string): Promise<string> {
  try {
    return await decrypt(encrypted, keyHex);
  } catch {
    try {
      return atob(encrypted);
    } catch {
      return encrypted;
    }
  }
}

/** SHA-256 hash of a string, returned as hex. */
async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Jaccard token-overlap similarity between two strings. */
function jaccardSimilarity(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(s.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean));
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Extract the assistant message text from a chat completion response. */
function extractResponseText(response: any): string {
  if (typeof response === "string") return response;
  // OpenAI-compatible format
  if (response?.choices?.[0]?.message?.content) {
    return response.choices[0].message.content;
  }
  // Plain text field
  if (response?.text) return response.text;
  if (response?.content) return response.content;
  // Fallback
  return JSON.stringify(response);
}

/** Extract messages array from a decrypted payload. */
function extractMessages(payload: any): any[] | null {
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return [{ role: "user", content: payload }];
    }
  }
  if (Array.isArray(payload?.messages)) return payload.messages;
  if (payload?.prompt) return [{ role: "user", content: payload.prompt }];
  if (typeof payload === "string") return [{ role: "user", content: payload }];
  return null;
}

const SIMILARITY_THRESHOLD = 0.25;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const encryptionKey = Deno.env.get("COMPUTE_ENCRYPTION_KEY");
  const verathosApiKey = Deno.env.get("VERATHOS_API_KEY");
  const sampleRate = parseFloat(Deno.env.get("VERATHOS_SAMPLE_RATE") || "0.15");

  if (!encryptionKey) {
    return new Response(
      JSON.stringify({ error: "COMPUTE_ENCRYPTION_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!verathosApiKey) {
    return new Response(
      JSON.stringify({ error: "VERATHOS_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Parse optional body for single-job verification
  let targetJobId: string | null = null;
  try {
    const body = await req.json();
    if (body?.job_id) targetJobId = body.job_id;
  } catch {
    // Empty body = batch mode
  }

  // Query candidates
  let query = supabase
    .from("compute_jobs")
    .select("id, assigned_worker_id, payload_encrypted, payload_hash, result_encrypted, result_hash, job_type")
    .eq("status", "completed")
    .eq("job_type", "inference")
    .eq("verification_status", "none");

  if (targetJobId) {
    query = query.eq("id", targetJobId);
  } else {
    query = query.order("completed_at", { ascending: false }).limit(50);
  }

  const { data: candidates, error: queryErr } = await query;

  if (queryErr || !candidates?.length) {
    return new Response(
      JSON.stringify({ verified: 0, message: queryErr?.message || "No candidates" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Random sample unless targeting a specific job
  const jobs = targetJobId
    ? candidates
    : candidates.filter(() => Math.random() < sampleRate);

  if (jobs.length === 0) {
    return new Response(
      JSON.stringify({ verified: 0, message: "No jobs sampled this round" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const results: any[] = [];

  for (const job of jobs) {
    const workerId = job.assigned_worker_id;

    // Mark as pending
    await supabase
      .from("compute_jobs")
      .update({ verification_status: "pending" })
      .eq("id", job.id);

    try {
      // Decrypt payload to get the original messages
      const payloadRaw = await safeDecrypt(job.payload_encrypted, encryptionKey);
      const messages = extractMessages(payloadRaw);

      if (!messages) {
        // Can't parse payload — skip, mark error
        await supabase.from("compute_verifications").insert({
          job_id: job.id,
          worker_id: workerId,
          verdict: "error",
          verathos_request_payload: { error: "Could not parse payload" },
        });
        await supabase
          .from("compute_jobs")
          .update({ verification_status: "error" })
          .eq("id", job.id);
        results.push({ job_id: job.id, verdict: "error", reason: "payload_parse" });
        continue;
      }

      // Call Verathos API
      const verathosStart = Date.now();
      let verathosResponse: any;
      let verathosError = false;

      try {
        const resp = await fetch("https://api.verathos.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${verathosApiKey}`,
          },
          body: JSON.stringify({
            messages,
            temperature: 0,
            max_tokens: 1024,
          }),
        });

        if (!resp.ok) {
          throw new Error(`Verathos API returned ${resp.status}`);
        }

        verathosResponse = await resp.json();
      } catch (err) {
        verathosError = true;
        // Verathos error — not the worker's fault
        await supabase.from("compute_verifications").insert({
          job_id: job.id,
          worker_id: workerId,
          verdict: "error",
          verathos_request_payload: { messages },
          verathos_latency_ms: Date.now() - verathosStart,
        });
        await supabase
          .from("compute_jobs")
          .update({ verification_status: "error" })
          .eq("id", job.id);
        // No trust penalty on API errors
        results.push({ job_id: job.id, verdict: "error", reason: "verathos_api" });
        continue;
      }

      const verathosLatency = Date.now() - verathosStart;
      const verathosText = extractResponseText(verathosResponse);
      const verathosHash = await sha256(verathosText);

      // Decrypt worker's result
      const workerResultRaw = await safeDecrypt(job.result_encrypted, encryptionKey);
      const workerText = extractResponseText(
        typeof workerResultRaw === "string"
          ? (() => { try { return JSON.parse(workerResultRaw); } catch { return workerResultRaw; } })()
          : workerResultRaw
      );
      const workerHash = await sha256(workerText);

      // Compare via Jaccard similarity
      const similarity = jaccardSimilarity(verathosText, workerText);
      const verdict = similarity >= SIMILARITY_THRESHOLD ? "pass" : "fail";
      const verificationStatus = verdict === "pass" ? "verified" : "failed";

      // Insert verification record
      await supabase.from("compute_verifications").insert({
        job_id: job.id,
        worker_id: workerId,
        verathos_request_payload: { messages },
        verathos_response_text: verathosText,
        verathos_response_hash: verathosHash,
        worker_response_text: workerText,
        worker_response_hash: workerHash,
        verdict,
        similarity_score: similarity,
        similarity_method: "jaccard",
        verathos_proof: {
          model: verathosResponse?.model || null,
          id: verathosResponse?.id || null,
          usage: verathosResponse?.usage || null,
        },
        verathos_model_used: verathosResponse?.model || null,
        verathos_request_id: verathosResponse?.id || null,
        verathos_latency_ms: verathosLatency,
      });

      // Update job verification status
      await supabase
        .from("compute_jobs")
        .update({ verification_status: verificationStatus })
        .eq("id", job.id);

      // Update worker trust score
      await supabase.rpc("update_worker_trust_score", {
        p_worker_id: workerId,
        p_verdict: verdict,
      });

      results.push({
        job_id: job.id,
        verdict,
        similarity: similarity.toFixed(4),
        verathos_latency_ms: verathosLatency,
      });
    } catch (err) {
      // Unexpected error — mark as error, no trust penalty
      await supabase
        .from("compute_jobs")
        .update({ verification_status: "error" })
        .eq("id", job.id);
      results.push({ job_id: job.id, verdict: "error", reason: String(err) });
    }
  }

  return new Response(
    JSON.stringify({ verified: results.length, results }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
