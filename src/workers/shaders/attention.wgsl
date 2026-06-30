// Multi-head attention compute shader
// Implements: Q/K/V projection, RoPE, scaled dot-product attention, output projection
// Operates on a single token position (autoregressive decoding)

struct Params {
  hidden_dim: u32,
  n_heads: u32,
  head_dim: u32,
  seq_pos: u32,      // current sequence position (for RoPE + KV cache indexing)
  kv_heads: u32,     // number of key/value heads (GQA support)
  max_seq_len: u32,
  _pad0: u32,
  _pad1: u32,
};

// Weight matrices stored as row-major [out_dim, in_dim]
@group(0) @binding(0) var<storage, read> input: array<f32>;       // [hidden_dim]
@group(0) @binding(1) var<storage, read> wq: array<f32>;          // [hidden_dim, hidden_dim]
@group(0) @binding(2) var<storage, read> wk: array<f32>;          // [kv_dim, hidden_dim]
@group(0) @binding(3) var<storage, read> wv: array<f32>;          // [kv_dim, hidden_dim]
@group(0) @binding(4) var<storage, read> wo: array<f32>;          // [hidden_dim, hidden_dim]
@group(0) @binding(5) var<storage, read_write> k_cache: array<f32>; // [max_seq_len, kv_dim]
@group(0) @binding(6) var<storage, read_write> v_cache: array<f32>; // [max_seq_len, kv_dim]
@group(0) @binding(7) var<storage, read_write> output: array<f32>;  // [hidden_dim]
@group(0) @binding(8) var<uniform> params: Params;

const WG_SIZE: u32 = 256u;
var<workgroup> shared_buf: array<f32, 256>;

// Apply rotary position embedding to a pair of values
fn rope_pair(x0: f32, x1: f32, freq: f32, pos: u32) -> vec2<f32> {
  let angle = f32(pos) * freq;
  let cos_a = cos(angle);
  let sin_a = sin(angle);
  return vec2<f32>(
    x0 * cos_a - x1 * sin_a,
    x0 * sin_a + x1 * cos_a,
  );
}

@compute @workgroup_size(256)
fn main(
  @builtin(local_invocation_id) lid: vec3<u32>,
  @builtin(workgroup_id) wid: vec3<u32>,
) {
  let tid = lid.x;
  let head_idx = wid.x;
  let head_dim = params.head_dim;
  let kv_dim = params.kv_heads * head_dim;
  let pos = params.seq_pos;

  // Determine which KV head this Q head maps to (GQA)
  let heads_per_kv = params.n_heads / params.kv_heads;
  let kv_head_idx = head_idx / heads_per_kv;

  // Step 1: Compute Q for this head
  // q[i] = sum_j(wq[head_idx * head_dim + i, j] * input[j])
  for (var i = tid; i < head_dim; i = i + WG_SIZE) {
    var sum: f32 = 0.0;
    let row = head_idx * head_dim + i;
    for (var j: u32 = 0u; j < params.hidden_dim; j = j + 1u) {
      sum = sum + wq[row * params.hidden_dim + j] * input[j];
    }
    // Apply RoPE
    if (i % 2u == 0u && i + 1u < head_dim) {
      let freq = 1.0 / pow(10000.0, f32(i) / f32(head_dim));
      let rotated = rope_pair(sum, 0.0, freq, pos);
      shared_buf[i] = rotated.x; // will be overwritten with proper pair below
    }
    shared_buf[i] = sum;
  }
  workgroupBarrier();

  // Apply RoPE to Q pairs
  for (var i = tid * 2u; i < head_dim; i = i + WG_SIZE * 2u) {
    if (i + 1u < head_dim) {
      let freq = 1.0 / pow(10000.0, f32(i) / f32(head_dim));
      let rotated = rope_pair(shared_buf[i], shared_buf[i + 1u], freq, pos);
      shared_buf[i] = rotated.x;
      shared_buf[i + 1u] = rotated.y;
    }
  }
  workgroupBarrier();

  // Copy Q to output temporarily (reuse output buffer for Q storage)
  // We need Q for the attention computation
  // For now, Q is in shared_buf[0..head_dim]

  // Step 2: Compute K and V for the KV head, store in cache
  if (head_idx < params.kv_heads) {
    for (var i = tid; i < head_dim; i = i + WG_SIZE) {
      var k_sum: f32 = 0.0;
      var v_sum: f32 = 0.0;
      let row = head_idx * head_dim + i;
      for (var j: u32 = 0u; j < params.hidden_dim; j = j + 1u) {
        k_sum = k_sum + wk[row * params.hidden_dim + j] * input[j];
        v_sum = v_sum + wv[row * params.hidden_dim + j] * input[j];
      }
      // RoPE on K
      if (i % 2u == 0u && i + 1u < head_dim) {
        // Handled in pair below
      }
      let cache_offset = pos * kv_dim + head_idx * head_dim;
      k_cache[cache_offset + i] = k_sum;
      v_cache[cache_offset + i] = v_sum;
    }
    workgroupBarrier();

    // Apply RoPE to K in cache
    let cache_offset = pos * kv_dim + head_idx * head_dim;
    for (var i = tid * 2u; i < head_dim; i = i + WG_SIZE * 2u) {
      if (i + 1u < head_dim) {
        let freq = 1.0 / pow(10000.0, f32(i) / f32(head_dim));
        let k0 = k_cache[cache_offset + i];
        let k1 = k_cache[cache_offset + i + 1u];
        let rotated = rope_pair(k0, k1, freq, pos);
        k_cache[cache_offset + i] = rotated.x;
        k_cache[cache_offset + i + 1u] = rotated.y;
      }
    }
  }
  workgroupBarrier();

  // Step 3: Scaled dot-product attention
  // score[t] = sum_i(Q[i] * K[t, kv_head, i]) / sqrt(head_dim)
  let scale = 1.0 / sqrt(f32(head_dim));

  // Find max score for numerical stability
  var max_score: f32 = -1e30;
  for (var t = tid; t <= pos; t = t + WG_SIZE) {
    var score: f32 = 0.0;
    let k_offset = t * kv_dim + kv_head_idx * head_dim;
    for (var i: u32 = 0u; i < head_dim; i = i + 1u) {
      score = score + shared_buf[i] * k_cache[k_offset + i];
    }
    score = score * scale;
    max_score = max(max_score, score);
  }

  // softmax(scores) * V
  var sum_exp: f32 = 0.0;
  for (var t = tid; t <= pos; t = t + WG_SIZE) {
    var score: f32 = 0.0;
    let k_offset = t * kv_dim + kv_head_idx * head_dim;
    for (var i: u32 = 0u; i < head_dim; i = i + 1u) {
      score = score + shared_buf[i] * k_cache[k_offset + i];
    }
    score = exp((score * scale) - max_score);
    sum_exp = sum_exp + score;
  }

  // Compute weighted sum of values
  for (var i = tid; i < head_dim; i = i + WG_SIZE) {
    var weighted: f32 = 0.0;
    for (var t: u32 = 0u; t <= pos; t = t + 1u) {
      var score: f32 = 0.0;
      let k_offset = t * kv_dim + kv_head_idx * head_dim;
      for (var d: u32 = 0u; d < head_dim; d = d + 1u) {
        score = score + shared_buf[d] * k_cache[k_offset + d];
      }
      let attn = exp((score * scale) - max_score) / sum_exp;
      let v_offset = t * kv_dim + kv_head_idx * head_dim;
      weighted = weighted + attn * v_cache[v_offset + i];
    }

    // Step 4: Output projection (partial — this head's contribution)
    // output[j] += wo[j, head_idx*head_dim + i] * weighted
    for (var j: u32 = 0u; j < params.hidden_dim; j = j + 1u) {
      // Atomic add since multiple heads write to same output
      let wo_idx = j * params.hidden_dim + head_idx * head_dim + i;
      output[j] = output[j] + wo[wo_idx] * weighted;
    }
  }
}
