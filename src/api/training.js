/**
 * Taste Training API — training batch operations for GPU workers.
 */
import { supabase } from "./supabase";

/**
 * Generate a training batch from recent high-quality votes.
 * @param {number} batchSize - Number of preference pairs to include.
 * @returns {string|null} Batch ID or null if insufficient data.
 */
export async function generateTrainingBatch(batchSize = 50) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("generate_training_batch", {
    p_batch_size: batchSize,
  });
  if (error) {
    console.error("[training] generateTrainingBatch error:", error.message);
    return null;
  }
  return data;
}

/**
 * Claim the oldest pending training batch for a worker.
 * @param {string} workerId - UUID of the compute worker.
 * @returns {{ batch_id, batch_data, batch_size }|null}
 */
export async function claimTrainingJob(workerId) {
  if (!supabase || !workerId) return null;
  const { data, error } = await supabase.rpc("claim_training_job", {
    p_worker_id: workerId,
  });
  if (error) {
    console.error("[training] claimTrainingJob error:", error.message);
    return null;
  }
  return data;
}

/**
 * Fetch the batch_data for a specific training batch.
 * @param {string} batchId - UUID of the batch.
 * @returns {object|null}
 */
export async function fetchTrainingBatch(batchId) {
  if (!supabase || !batchId) return null;
  const { data, error } = await supabase
    .from("taste_training_batches")
    .select("id, batch_data, batch_size, status")
    .eq("id", batchId)
    .single();
  if (error) return null;
  return data;
}

/**
 * Submit training result (embeddings) for a completed batch.
 * @param {string} batchId - UUID of the batch.
 * @param {string} workerId - UUID of the worker.
 * @param {object} embeddings - { itemId: [vector], ... }
 * @returns {{ coins: number, usdc: number }}
 */
export async function submitTrainingResult(batchId, workerId, embeddings) {
  if (!supabase) return { coins: 0, usdc: 0 };
  const { data, error } = await supabase.rpc("submit_training_result", {
    p_batch_id: batchId,
    p_worker_id: workerId,
    p_result_embeddings: embeddings,
  });
  if (error) {
    console.error("[training] submitTrainingResult error:", error.message);
    return { coins: 0, usdc: 0 };
  }
  return data || { coins: 0, usdc: 0 };
}

/**
 * Fetch training stats: completed batches + latest embedding timestamp.
 * @returns {{ completedBatches: number, latestEmbeddingAt: string|null }}
 */
export async function fetchTrainingStats() {
  if (!supabase) return { completedBatches: 0, latestEmbeddingAt: null };
  try {
    const [batchRes, embeddingRes] = await Promise.all([
      supabase
        .from("taste_training_batches")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed"),
      supabase
        .from("taste_embeddings")
        .select("updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .single(),
    ]);
    return {
      completedBatches: batchRes.count || 0,
      latestEmbeddingAt: embeddingRes.data?.updated_at || null,
    };
  } catch {
    return { completedBatches: 0, latestEmbeddingAt: null };
  }
}
