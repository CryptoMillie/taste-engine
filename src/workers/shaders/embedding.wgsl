// Token embedding compute shader (stage 0 only)
// Looks up token ID in embedding table and writes hidden state
// output[i] = embedding_table[token_id * hidden_dim + i]

struct Params {
  token_id: u32,
  hidden_dim: u32,
  vocab_size: u32,
  _pad: u32,
};

@group(0) @binding(0) var<storage, read> embedding_table: array<f32>; // [vocab_size, hidden_dim]
@group(0) @binding(1) var<storage, read_write> output: array<f32>;     // [hidden_dim]
@group(0) @binding(2) var<uniform> params: Params;

const WG_SIZE: u32 = 256u;

@compute @workgroup_size(256)
fn main(
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let tid = lid.x;
  let offset = params.token_id * params.hidden_dim;

  for (var i = tid; i < params.hidden_dim; i = i + WG_SIZE) {
    if (offset + i < params.vocab_size * params.hidden_dim) {
      output[i] = embedding_table[offset + i];
    }
  }
}
