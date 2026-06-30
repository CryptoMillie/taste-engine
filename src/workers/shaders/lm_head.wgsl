// LM head + sampling compute shader (final stage only)
// Computes logits from hidden state, applies temperature, finds argmax token
// logits[v] = sum_i(lm_head_weight[v, i] * hidden[i])

struct Params {
  hidden_dim: u32,
  vocab_size: u32,
  temperature: f32,
  _pad: u32,
};

@group(0) @binding(0) var<storage, read> hidden: array<f32>;         // [hidden_dim]
@group(0) @binding(1) var<storage, read> lm_head_weight: array<f32>; // [vocab_size, hidden_dim]
@group(0) @binding(2) var<storage, read_write> logits: array<f32>;   // [vocab_size]
@group(0) @binding(3) var<storage, read_write> result: array<u32>;   // [2]: result[0] = argmax token, result[1] = float bits of max logit
@group(0) @binding(4) var<uniform> params: Params;

const WG_SIZE: u32 = 256u;
var<workgroup> shared_max_val: array<f32, 256>;
var<workgroup> shared_max_idx: array<u32, 256>;

@compute @workgroup_size(256)
fn main(
  @builtin(local_invocation_id) lid: vec3<u32>,
  @builtin(workgroup_id) wid: vec3<u32>,
) {
  let tid = lid.x;

  // Phase 1: Compute logits for each vocab token assigned to this thread
  // Each workgroup handles a chunk of vocab
  let chunk_start = wid.x * WG_SIZE;

  for (var v = chunk_start + tid; v < params.vocab_size; v = v + WG_SIZE * 1u) {
    // Only process if within bounds for this workgroup
    if (v < chunk_start + WG_SIZE) {
      var logit: f32 = 0.0;
      for (var i: u32 = 0u; i < params.hidden_dim; i = i + 1u) {
        logit = logit + lm_head_weight[v * params.hidden_dim + i] * hidden[i];
      }
      // Apply temperature
      if (params.temperature > 0.0) {
        logit = logit / params.temperature;
      }
      logits[v] = logit;
    }
  }

  // Phase 2: Find argmax within this workgroup's chunk
  var local_max: f32 = -1e30;
  var local_idx: u32 = 0u;

  for (var v = chunk_start + tid; v < min(chunk_start + WG_SIZE, params.vocab_size); v = v + WG_SIZE) {
    if (logits[v] > local_max) {
      local_max = logits[v];
      local_idx = v;
    }
  }

  shared_max_val[tid] = local_max;
  shared_max_idx[tid] = local_idx;
  workgroupBarrier();

  // Parallel reduction for argmax
  for (var stride = WG_SIZE / 2u; stride > 0u; stride = stride / 2u) {
    if (tid < stride) {
      if (shared_max_val[tid + stride] > shared_max_val[tid]) {
        shared_max_val[tid] = shared_max_val[tid + stride];
        shared_max_idx[tid] = shared_max_idx[tid + stride];
      }
    }
    workgroupBarrier();
  }

  // Write result from first thread of first workgroup
  if (tid == 0u && wid.x == 0u) {
    result[0] = shared_max_idx[0];
    result[1] = bitcast<u32>(shared_max_val[0]);
  }
}
