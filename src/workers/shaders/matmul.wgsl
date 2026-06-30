// Matrix multiplication compute shader
// C = A * B where A is [M, K], B is [K, N], C is [M, N]
// Uses 16x16 workgroup tiles for efficient GPU utilization

struct Params {
  M: u32,
  K: u32,
  N: u32,
  _pad: u32,
};

@group(0) @binding(0) var<storage, read> A: array<f32>;
@group(0) @binding(1) var<storage, read> B: array<f32>;
@group(0) @binding(2) var<storage, read_write> C: array<f32>;
@group(0) @binding(3) var<uniform> params: Params;

const TILE_SIZE: u32 = 16u;

var<workgroup> tileA: array<f32, 256>; // 16x16
var<workgroup> tileB: array<f32, 256>; // 16x16

@compute @workgroup_size(16, 16)
fn main(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
  @builtin(workgroup_id) wid: vec3<u32>,
) {
  let row = gid.x;
  let col = gid.y;
  let localRow = lid.x;
  let localCol = lid.y;

  var sum: f32 = 0.0;
  let numTiles = (params.K + TILE_SIZE - 1u) / TILE_SIZE;

  for (var t: u32 = 0u; t < numTiles; t = t + 1u) {
    // Load tile of A
    let aCol = t * TILE_SIZE + localCol;
    if (row < params.M && aCol < params.K) {
      tileA[localRow * TILE_SIZE + localCol] = A[row * params.K + aCol];
    } else {
      tileA[localRow * TILE_SIZE + localCol] = 0.0;
    }

    // Load tile of B
    let bRow = t * TILE_SIZE + localRow;
    if (bRow < params.K && col < params.N) {
      tileB[localRow * TILE_SIZE + localCol] = B[bRow * params.N + col];
    } else {
      tileB[localRow * TILE_SIZE + localCol] = 0.0;
    }

    workgroupBarrier();

    // Accumulate
    for (var k: u32 = 0u; k < TILE_SIZE; k = k + 1u) {
      sum = sum + tileA[localRow * TILE_SIZE + k] * tileB[k * TILE_SIZE + localCol];
    }

    workgroupBarrier();
  }

  if (row < params.M && col < params.N) {
    C[row * params.N + col] = sum;
  }
}
