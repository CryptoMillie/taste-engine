/**
 * GPU Compute Marketplace API — worker + membership operations.
 * Privacy: raw device IDs are SHA-256 hashed before storage.
 * GPU details are classified into a generic tier, never stored verbatim.
 */
import { supabase } from "./supabase";

/** SHA-256 hash a string. Returns hex digest. */
async function hashId(raw) {
  const data = new TextEncoder().encode(raw);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Classify GPU renderer into a generic tier (never store raw string). */
export function classifyGpu(renderer) {
  const r = (renderer || "").toLowerCase();
  if (/4090|4080|3090|a100|h100|rx\s*7900/i.test(r)) return "high";
  if (/4070|3080|3070|rx\s*7800|rx\s*6[89]00/i.test(r)) return "mid";
  if (/4060|3060|2080|rx\s*7600|rx\s*6[67]00/i.test(r)) return "mid";
  if (r) return "low";
  return "unknown";
}

/**
 * USDC earnings rate per hour by GPU class.
 * These are the rates workers see — platform takes 20% from buyers on top.
 */
export const EARNINGS_RATES = {
  high:    { usdcPerHour: 0.25, coinsPerHour: 80 },
  mid:     { usdcPerHour: 0.15, coinsPerHour: 60 },
  low:     { usdcPerHour: 0.08, coinsPerHour: 40 },
  unknown: { usdcPerHour: 0.10, coinsPerHour: 50 },
};

/** Register or update a compute worker for this device. */
export async function registerWorker(userId, deviceId, gpuInfo) {
  if (!supabase || !userId) return null;
  try {
    const deviceIdHash = await hashId(deviceId);
    const { data, error } = await supabase
      .from("compute_workers")
      .upsert(
        {
          user_id: userId,
          device_id_hash: deviceIdHash,
          gpu_class: classifyGpu(gpuInfo.renderer),
          status: "idle",
          last_heartbeat: new Date().toISOString(),
        },
        { onConflict: "user_id,device_id_hash" }
      )
      .select()
      .single();
    if (error) {
      console.error("registerWorker error:", error.message);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/** Update worker heartbeat timestamp. */
export async function sendHeartbeat(workerId) {
  if (!supabase || !workerId) return;
  try {
    await supabase
      .from("compute_workers")
      .update({ last_heartbeat: new Date().toISOString() })
      .eq("id", workerId);
  } catch { /* ignore */ }
}

/** Claim an available job via RPC. Returns job_id or null. */
export async function claimJob(workerId) {
  if (!supabase || !workerId) return null;
  try {
    const { data, error } = await supabase.rpc("claim_compute_job", {
      p_worker_id: workerId,
    });
    if (error) {
      console.error("claimJob error:", error.message);
      return null;
    }
    return data; // uuid or null
  } catch {
    return null;
  }
}

/** Fetch job payload after claiming. */
export async function fetchJobPayload(jobId) {
  if (!supabase || !jobId) return null;
  try {
    const { data } = await supabase
      .from("compute_jobs")
      .select("id, job_type, payload_encrypted, payload_hash, coins_reward, usdc_reward, max_duration_ms")
      .eq("id", jobId)
      .single();
    return data;
  } catch {
    return null;
  }
}

/** Submit job result via RPC. Returns { coins, usdc }. */
export async function submitJobResult(jobId, workerId, resultEncrypted, resultHash) {
  if (!supabase || !jobId || !workerId) return { coins: 0, usdc: 0 };
  try {
    const { data, error } = await supabase.rpc("complete_compute_job", {
      p_job_id: jobId,
      p_worker_id: workerId,
      p_result_encrypted: resultEncrypted,
      p_result_hash: resultHash,
    });
    if (error) {
      console.error("submitJobResult error:", error.message);
      return { coins: 0, usdc: 0 };
    }
    return data || { coins: 0, usdc: 0 };
  } catch {
    return { coins: 0, usdc: 0 };
  }
}

/** Update worker status (idle/offline). */
export async function updateWorkerStatus(workerId, status) {
  if (!supabase || !workerId) return;
  try {
    await supabase
      .from("compute_workers")
      .update({ status })
      .eq("id", workerId);
  } catch { /* ignore */ }
}

/** Fetch worker stats for a user. */
export async function fetchWorkerStats(userId) {
  if (!supabase || !userId) return null;
  try {
    const { data } = await supabase
      .from("compute_workers")
      .select("id, gpu_class, status, total_jobs, total_coins_earned, total_usdc_earned")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    return data;
  } catch {
    return null;
  }
}

/** Fetch user's compute membership. */
export async function fetchMembership(userId) {
  if (!supabase || !userId) return null;
  try {
    const { data } = await supabase
      .from("compute_memberships")
      .select("*")
      .eq("user_id", userId)
      .single();
    return data;
  } catch {
    return null;
  }
}

/** Initialize membership for a user (free tier + 48hr trial). */
export async function initMembership(userId) {
  if (!supabase || !userId) return null;
  try {
    const { data, error } = await supabase
      .from("compute_memberships")
      .upsert(
        {
          user_id: userId,
          tier: "free",
          trial_started_at: new Date().toISOString(),
          trial_ends_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          daily_jobs_used: 0,
          daily_jobs_reset_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
        { onConflict: "user_id", ignoreDuplicates: true }
      )
      .select()
      .single();
    if (error) {
      console.error("initMembership error:", error.message);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}
