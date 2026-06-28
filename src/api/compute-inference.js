/**
 * Network inference — route LLM requests through the compute marketplace.
 * Submit a job via compute-submit, poll compute-result for completion.
 * Falls back gracefully (returns null) so callers can try Chutes.
 */

import { supabase } from "./supabase";
import { fetchNetworkStats } from "./compute";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Run inference through the compute network.
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {Object} opts - { maxTokens, temperature, timeoutMs }
 * @returns {Promise<string|null>} The assistant's response text, or null on failure.
 */
export async function networkInfer(systemPrompt, userPrompt, opts = {}) {
  if (!supabase || !SUPABASE_URL) return null;

  const { maxTokens = 500, temperature = 0.7, timeoutMs = 30000 } = opts;

  try {
    // Check if any workers are online
    const stats = await fetchNetworkStats();
    if (!stats || (stats.workers_online || 0) === 0) return null;

    // Get session token for auth
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return null;

    // Submit job
    const payload = {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature,
    };

    const submitRes = await fetch(`${SUPABASE_URL}/functions/v1/compute-submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        job_type: "inference",
        payload,
        coins_reward: 10,
        usdc_reward: 0.001,
        max_duration_ms: timeoutMs,
      }),
    });

    if (!submitRes.ok) return null;

    const { job_id } = await submitRes.json();
    if (!job_id) return null;

    // Poll for result
    const pollInterval = 500;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, pollInterval));

      const resultRes = await fetch(`${SUPABASE_URL}/functions/v1/compute-result`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ job_id }),
      });

      if (!resultRes.ok) continue;

      const data = await resultRes.json();

      if (data.status === "completed" && data.result) {
        // Extract assistant message from the result
        const result = data.result;
        if (result.choices?.[0]?.message?.content) {
          return result.choices[0].message.content;
        }
        if (typeof result === "string") return result;
        return JSON.stringify(result);
      }

      if (data.status === "failed" || data.status === "expired") {
        return null;
      }
    }

    return null; // timeout
  } catch {
    return null;
  }
}
