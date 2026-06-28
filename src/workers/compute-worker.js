/**
 * GPU Compute Web Worker
 * Runs WebGPU compute jobs in a sandboxed worker thread.
 * MVP: 256x256 matrix multiply benchmark.
 *
 * Messages IN:  { type: "execute", jobId, jobType, payload }
 * Messages OUT: { type: "result", jobId, resultEncrypted, resultHash }
 *               { type: "error", jobId, error }
 */

/* global self */

// SHA-256 hash using SubtleCrypto
async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Run a 256x256 matrix multiply benchmark on WebGPU
async function runMatrixBenchmark() {
  if (!navigator.gpu) {
    throw new Error("WebGPU not available");
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No GPU adapter found");

  const device = await adapter.requestDevice();

  const SIZE = 256;
  const ELEMENTS = SIZE * SIZE;

  // Create input matrices (random floats)
  const matA = new Float32Array(ELEMENTS);
  const matB = new Float32Array(ELEMENTS);
  for (let i = 0; i < ELEMENTS; i++) {
    matA[i] = Math.random();
    matB[i] = Math.random();
  }

  // Create GPU buffers
  const bufferA = device.createBuffer({
    size: matA.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const bufferB = device.createBuffer({
    size: matB.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const bufferResult = device.createBuffer({
    size: ELEMENTS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const bufferReadback = device.createBuffer({
    size: ELEMENTS * 4,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(bufferA, 0, matA);
  device.queue.writeBuffer(bufferB, 0, matB);

  // Compute shader: matrix multiply
  const shaderModule = device.createShaderModule({
    code: `
      @group(0) @binding(0) var<storage, read> a: array<f32>;
      @group(0) @binding(1) var<storage, read> b: array<f32>;
      @group(0) @binding(2) var<storage, read_write> result: array<f32>;

      const SIZE: u32 = 256u;

      @compute @workgroup_size(16, 16)
      fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
        let row = gid.x;
        let col = gid.y;
        if (row >= SIZE || col >= SIZE) { return; }
        var sum: f32 = 0.0;
        for (var k: u32 = 0u; k < SIZE; k = k + 1u) {
          sum = sum + a[row * SIZE + k] * b[k * SIZE + col];
        }
        result[row * SIZE + col] = sum;
      }
    `,
  });

  const pipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: shaderModule, entryPoint: "main" },
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: bufferA } },
      { binding: 1, resource: { buffer: bufferB } },
      { binding: 2, resource: { buffer: bufferResult } },
    ],
  });

  const startTime = performance.now();

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(SIZE / 16, SIZE / 16);
  pass.end();
  encoder.copyBufferToBuffer(bufferResult, 0, bufferReadback, 0, ELEMENTS * 4);
  device.queue.submit([encoder.finish()]);

  await bufferReadback.mapAsync(GPUMapMode.READ);
  const output = new Float32Array(bufferReadback.getMappedRange().slice(0));
  bufferReadback.unmap();

  const elapsed = performance.now() - startTime;

  // Compute summary stats
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < output.length; i++) {
    sum += output[i];
    if (output[i] < min) min = output[i];
    if (output[i] > max) max = output[i];
  }

  // Cleanup GPU resources
  bufferA.destroy();
  bufferB.destroy();
  bufferResult.destroy();
  bufferReadback.destroy();
  device.destroy();

  return {
    benchmarkType: "matmul_256x256",
    elapsedMs: Math.round(elapsed * 100) / 100,
    resultSum: sum,
    resultMin: min,
    resultMax: max,
    elements: output.length,
  };
}

// Message handler
self.onmessage = async (e) => {
  const { type, jobId, jobType } = e.data;

  if (type !== "execute") return;

  try {
    let result;

    if (jobType === "benchmark" || jobType === "inference" || jobType === "embedding") {
      // MVP: all job types run the matrix benchmark
      result = await runMatrixBenchmark();
    } else {
      throw new Error(`Unknown job type: ${jobType}`);
    }

    const resultStr = JSON.stringify(result);
    const resultHash = await sha256(resultStr);
    // Base64-encode the result as "encrypted" output (MVP — no real encryption in worker)
    const resultEncrypted = btoa(resultStr);

    self.postMessage({
      type: "result",
      jobId,
      resultEncrypted,
      resultHash,
    });
  } catch (err) {
    self.postMessage({
      type: "error",
      jobId,
      error: err.message || "Unknown error",
    });
  }
};
