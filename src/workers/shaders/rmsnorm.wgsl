// RMSNorm compute shader
// out[i] = (x[i] / rms) * weight[i]
// where rms = sqrt(mean(x^2) + eps)

struct Params {
  size: u32,       // hidden dimension
  eps: f32,        // epsilon (typically 1e-6)
  _pad0: u32,
  _pad1: u32,
};

@group(0) @binding(0) var<storage, read> input: array<f32>;
@group(0) @binding(1) var<storage, read> weight: array<f32>;
@group(0) @binding(2) var<storage, read_write> output: array<f32>;
@group(0) @binding(3) var<uniform> params: Params;

const WG_SIZE: u32 = 256u;
var<workgroup> shared_sum: array<f32, 256>;

@compute @workgroup_size(256)
fn main(
  @builtin(local_invocation_id) lid: vec3<u32>,
  @builtin(workgroup_id) wid: vec3<u32>,
) {
  let tid = lid.x;
  let offset = wid.x * params.size;

  // Compute partial sum of squares
  var sum_sq: f32 = 0.0;
  for (var i = tid; i < params.size; i = i + WG_SIZE) {
    let val = input[offset + i];
    sum_sq = sum_sq + val * val;
  }
  shared_sum[tid] = sum_sq;

  workgroupBarrier();

  // Parallel reduction
  for (var stride = WG_SIZE / 2u; stride > 0u; stride = stride / 2u) {
    if (tid < stride) {
      shared_sum[tid] = shared_sum[tid] + shared_sum[tid + stride];
    }
    workgroupBarrier();
  }

  let rms = sqrt(shared_sum[0] / f32(params.size) + params.eps);

  // Normalize and scale
  for (var i = tid; i < params.size; i = i + WG_SIZE) {
    output[offset + i] = (input[offset + i] / rms) * weight[i];
  }
}
