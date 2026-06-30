#!/usr/bin/env node
/**
 * split-model.js — Offline script to split a GGUF model into per-layer shards
 * for layer-sharded pipeline inference.
 *
 * Usage:
 *   node scripts/split-model.js <input.gguf> <output-dir> [--stages 4]
 *
 * Output:
 *   <output-dir>/llama-8b-layers-0-7.bin
 *   <output-dir>/llama-8b-layers-8-15.bin
 *   <output-dir>/llama-8b-layers-16-23.bin
 *   <output-dir>/llama-8b-layers-24-31.bin
 *   <output-dir>/manifest.json
 *
 * Each shard contains the weight tensors for its assigned layers,
 * serialized as a flat Float32Array in a known tensor order:
 *   Per layer: attn_norm, wq, wk, wv, wo, ffn_norm, gate_proj, up_proj, down_proj
 *   Stage 0 also prepends: embedding_table
 *   Last stage also appends: final_norm, lm_head_weight
 *
 * The manifest.json maps shard files to layer ranges and includes model config.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, basename } from "path";

// ── GGUF parser (minimal) ──────────────────────────────────────────

const GGUF_MAGIC = 0x46475547; // 'GGUF' in little-endian

function readGGUF(filepath) {
  const buffer = readFileSync(filepath);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let offset = 0;

  // Magic
  const magic = view.getUint32(offset, true);
  offset += 4;
  if (magic !== GGUF_MAGIC) {
    throw new Error(`Not a GGUF file (magic: 0x${magic.toString(16)})`);
  }

  // Version
  const version = view.getUint32(offset, true);
  offset += 4;
  console.log(`GGUF version: ${version}`);

  // Tensor count
  const tensorCount = Number(view.getBigUint64(offset, true));
  offset += 8;
  console.log(`Tensor count: ${tensorCount}`);

  // Metadata KV count
  const metadataCount = Number(view.getBigUint64(offset, true));
  offset += 8;
  console.log(`Metadata entries: ${metadataCount}`);

  // Parse metadata (simplified — skip complex types)
  const metadata = {};
  for (let i = 0; i < metadataCount; i++) {
    const { value: key, newOffset: o1 } = readString(buffer, offset);
    offset = o1;
    const valueType = view.getUint32(offset, true);
    offset += 4;
    const { value, newOffset: o2 } = readValue(buffer, view, offset, valueType);
    offset = o2;
    metadata[key] = value;
  }

  // Parse tensor info
  const tensors = [];
  for (let i = 0; i < tensorCount; i++) {
    const { value: name, newOffset: o1 } = readString(buffer, offset);
    offset = o1;

    const nDims = view.getUint32(offset, true);
    offset += 4;

    const dims = [];
    for (let d = 0; d < nDims; d++) {
      dims.push(Number(view.getBigUint64(offset, true)));
      offset += 8;
    }

    const type = view.getUint32(offset, true);
    offset += 4;

    const dataOffset = Number(view.getBigUint64(offset, true));
    offset += 8;

    tensors.push({ name, dims, type, dataOffset });
  }

  return { metadata, tensors, buffer };
}

function readString(buffer, offset) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const len = Number(view.getBigUint64(offset, true));
  offset += 8;
  const str = new TextDecoder().decode(buffer.subarray(offset, offset + len));
  return { value: str, newOffset: offset + len };
}

function readValue(buffer, view, offset, type) {
  switch (type) {
    case 0: // UINT8
      return { value: view.getUint8(offset), newOffset: offset + 1 };
    case 1: // INT8
      return { value: view.getInt8(offset), newOffset: offset + 1 };
    case 2: // UINT16
      return { value: view.getUint16(offset, true), newOffset: offset + 2 };
    case 3: // INT16
      return { value: view.getInt16(offset, true), newOffset: offset + 2 };
    case 4: // UINT32
      return { value: view.getUint32(offset, true), newOffset: offset + 4 };
    case 5: // INT32
      return { value: view.getInt32(offset, true), newOffset: offset + 4 };
    case 6: // FLOAT32
      return { value: view.getFloat32(offset, true), newOffset: offset + 4 };
    case 7: // BOOL
      return { value: view.getUint8(offset) !== 0, newOffset: offset + 1 };
    case 8: { // STRING
      return readString(buffer, offset);
    }
    case 9: { // ARRAY
      const arrType = view.getUint32(offset, true);
      offset += 4;
      const arrLen = Number(view.getBigUint64(offset, true));
      offset += 8;
      const arr = [];
      for (let i = 0; i < arrLen; i++) {
        const { value, newOffset } = readValue(buffer, view, offset, arrType);
        arr.push(value);
        offset = newOffset;
      }
      return { value: arr, newOffset: offset };
    }
    case 10: // UINT64
      return { value: Number(view.getBigUint64(offset, true)), newOffset: offset + 8 };
    case 11: // INT64
      return { value: Number(view.getBigInt64(offset, true)), newOffset: offset + 8 };
    case 12: // FLOAT64
      return { value: view.getFloat64(offset, true), newOffset: offset + 8 };
    default:
      console.warn(`Unknown value type ${type} at offset ${offset}`);
      return { value: null, newOffset: offset };
  }
}

// ── GGUF quantization type sizes (bytes per element) ────────────────

const GGML_TYPE_SIZES = {
  0: 4,    // F32
  1: 2,    // F16
  2: 0.5,  // Q4_0 (block size 32, 18 bytes per block → 0.5625 per element)
  3: 0.5,  // Q4_1
  6: 0.625, // Q5_0
  7: 0.625, // Q5_1
  8: 1,    // Q8_0
  9: 1,    // Q8_1
};

function tensorByteSize(tensor) {
  const elements = tensor.dims.reduce((a, b) => a * b, 1);
  const bytesPerElement = GGML_TYPE_SIZES[tensor.type] || 4;
  return Math.ceil(elements * bytesPerElement);
}

// ── Main ────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log("Usage: node scripts/split-model.js <input.gguf> <output-dir> [--stages 4]");
    process.exit(1);
  }

  const inputPath = args[0];
  const outputDir = args[1];
  const stagesIdx = args.indexOf("--stages");
  const numStages = stagesIdx >= 0 ? parseInt(args[stagesIdx + 1]) : 4;

  console.log(`Splitting ${inputPath} into ${numStages} shards...`);
  console.log(`Output directory: ${outputDir}`);

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Parse GGUF
  const { metadata, tensors, buffer } = readGGUF(inputPath);

  // Extract model config from metadata
  const config = {
    hidden_dim: metadata["llama.embedding_length"] || metadata["gpt2.embedding_length"] || 4096,
    n_heads: metadata["llama.attention.head_count"] || 32,
    kv_heads: metadata["llama.attention.head_count_kv"] || 8,
    total_layers: metadata["llama.block_count"] || 32,
    ffn_dim: metadata["llama.feed_forward_length"] || 14336,
    vocab_size: metadata["llama.vocab_size"] || metadata["tokenizer.ggml.tokens"]?.length || 128256,
    max_seq_len: metadata["llama.context_length"] || 2048,
  };

  config.head_dim = config.hidden_dim / config.n_heads;

  console.log("Model config:", config);

  const totalLayers = config.total_layers;
  const layersPerStage = Math.ceil(totalLayers / numStages);

  console.log(`${totalLayers} layers, ${layersPerStage} per stage`);

  // Categorize tensors by layer
  const layerTensors = {};
  const globalTensors = {};

  for (const tensor of tensors) {
    const match = tensor.name.match(/blk\.(\d+)\./);
    if (match) {
      const layerIdx = parseInt(match[1]);
      if (!layerTensors[layerIdx]) layerTensors[layerIdx] = [];
      layerTensors[layerIdx].push(tensor);
    } else {
      globalTensors[tensor.name] = tensor;
    }
  }

  console.log(`Found ${Object.keys(layerTensors).length} layers, ${Object.keys(globalTensors).length} global tensors`);

  // Generate shards
  const manifest = {
    model_name: basename(inputPath, ".gguf"),
    total_stages: numStages,
    total_layers: totalLayers,
    config,
    shards: [],
  };

  for (let stage = 0; stage < numStages; stage++) {
    const layerStart = stage * layersPerStage;
    const layerEnd = Math.min((stage + 1) * layersPerStage, totalLayers);

    const shardName = `${manifest.model_name}-layers-${layerStart}-${layerEnd - 1}.bin`;
    const shardPath = join(outputDir, shardName);

    const chunks = [];

    // Stage 0: include embedding table
    if (stage === 0) {
      const embTensor = globalTensors["token_embd.weight"];
      if (embTensor) {
        const size = tensorByteSize(embTensor);
        chunks.push(buffer.subarray(embTensor.dataOffset, embTensor.dataOffset + size));
        console.log(`  Stage ${stage}: embedding table (${(size / 1024 / 1024).toFixed(1)} MB)`);
      }
    }

    // Layer weights
    for (let l = layerStart; l < layerEnd; l++) {
      const lt = layerTensors[l] || [];
      for (const tensor of lt) {
        const size = tensorByteSize(tensor);
        chunks.push(buffer.subarray(tensor.dataOffset, tensor.dataOffset + size));
      }
    }

    // Last stage: include final norm + LM head
    if (stage === numStages - 1) {
      const normTensor = globalTensors["output_norm.weight"];
      if (normTensor) {
        const size = tensorByteSize(normTensor);
        chunks.push(buffer.subarray(normTensor.dataOffset, normTensor.dataOffset + size));
        console.log(`  Stage ${stage}: final norm (${(size / 1024).toFixed(1)} KB)`);
      }
      const lmTensor = globalTensors["output.weight"];
      if (lmTensor) {
        const size = tensorByteSize(lmTensor);
        chunks.push(buffer.subarray(lmTensor.dataOffset, lmTensor.dataOffset + size));
        console.log(`  Stage ${stage}: LM head (${(size / 1024 / 1024).toFixed(1)} MB)`);
      }
    }

    // Concatenate and write shard
    const totalSize = chunks.reduce((a, c) => a + c.length, 0);
    const shard = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      shard.set(chunk, offset);
      offset += chunk.length;
    }

    writeFileSync(shardPath, shard);
    console.log(`  Wrote ${shardName} (${(totalSize / 1024 / 1024).toFixed(1)} MB)`);

    manifest.shards.push({
      stage,
      filename: shardName,
      layer_start: layerStart,
      layer_end: layerEnd,
      size_bytes: totalSize,
      includes_embedding: stage === 0,
      includes_lm_head: stage === numStages - 1,
    });
  }

  // Write manifest
  const manifestPath = join(outputDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nWrote manifest.json`);
  console.log("Done!");
}

main();
