// SiLU-gated feed-forward network compute shader
// Implements: output = down_proj(silu(gate_proj(x)) * up_proj(x))
// where silu(x) = x * sigmoid(x)

struct Params {
  hidden_dim: u32,
  ffn_dim: u32,       // intermediate dimension (typically 4 * hidden_dim or 14336 for 8B)
  _pad0: u32,
  _pad1: u32,
};

@group(0) @binding(0) var<storage, read> input: array<f32>;       // [hidden_dim]
@group(0) @binding(1) var<storage, read> gate_proj: array<f32>;   // [ffn_dim, hidden_dim]
@group(0) @binding(2) var<storage, read> up_proj: array<f32>;     // [ffn_dim, hidden_dim]
@group(0) @binding(3) var<storage, read> down_proj: array<f32>;   // [hidden_dim, ffn_dim]
@group(0) @binding(4) var<storage, read_write> output: array<f32>; // [hidden_dim]
@group(0) @binding(5) var<uniform> params: Params;

const WG_SIZE: u32 = 256u;

fn silu(x: f32) -> f32 {
  return x / (1.0 + exp(-x));
}

@compute @workgroup_size(256)
fn main(
  @builtin(local_invocation_id) lid: vec3<u32>,
  @builtin(workgroup_id) wid: vec3<u32>,
) {
  let tid = lid.x;

  // Phase 1: Compute gate and up projections, apply SiLU gating
  // intermediate[i] = silu(gate_proj[i] . input) * (up_proj[i] . input)
  // Then Phase 2: output[j] = sum_i(down_proj[j,i] * intermediate[i])

  // We process output dimensions in workgroups
  let out_idx = wid.x * WG_SIZE + tid;

  if (out_idx < params.hidden_dim) {
    var result: f32 = 0.0;

    for (var i: u32 = 0u; i < params.ffn_dim; i = i + 1u) {
      // Compute gate and up for intermediate i
      var gate_val: f32 = 0.0;
      var up_val: f32 = 0.0;

      for (var j: u32 = 0u; j < params.hidden_dim; j = j + 1u) {
        let in_val = input[j];
        gate_val = gate_val + gate_proj[i * params.hidden_dim + j] * in_val;
        up_val = up_val + up_proj[i * params.hidden_dim + j] * in_val;
      }

      let intermediate = silu(gate_val) * up_val;
      result = result + down_proj[out_idx * params.ffn_dim + i] * intermediate;
    }

    output[out_idx] = result;
  }
}
