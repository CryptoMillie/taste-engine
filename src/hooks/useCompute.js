import { useState, useEffect, useCallback, useRef } from "react";
import {
  registerWorker,
  sendHeartbeat,
  claimJob,
  fetchJobPayload,
  submitJobResult,
  updateWorkerStatus,
  fetchWorkerStats,
  fetchMembership,
  initMembership,
  fetchNetworkStats,
  fetchVerificationHistory,
  fetchShardModels,
  fetchShardStats,
  fetchUserShardJobs,
  classifyGpu,
  EARNINGS_RATES,
  joinPipeline,
  leavePipeline,
  claimPipelineStage,
  submitActivation,
  completePipelineJob,
  sendPipelineHeartbeat,
  fetchPipelineStatus,
} from "../api/compute";

/** SHA-256 hash for pipeline activation integrity. */
async function sha256Pipeline(data) {
  const buf = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Hook for GPU compute worker lifecycle.
 * Tracks USDC + coins earnings, provides a live $/hr rate, and
 * a session elapsed timer for projected earnings display.
 */
export function useCompute(userId) {
  const [gpuAvailable, setGpuAvailable] = useState(false);
  const [gpuInfo, setGpuInfo] = useState({ vendor: "", renderer: "" });
  const [gpuClass, setGpuClass] = useState("unknown");
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState("offline"); // offline | idle | busy
  const [currentJob, setCurrentJob] = useState(null);
  const [jobsThisSession, setJobsThisSession] = useState(0);
  const [coinsThisSession, setCoinsThisSession] = useState(0);
  const [usdcThisSession, setUsdcThisSession] = useState(0);
  const [workerStats, setWorkerStats] = useState(null);
  const [membership, setMembership] = useState(null);
  const [sessionElapsed, setSessionElapsed] = useState(0); // seconds
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);
  const [networkStats, setNetworkStats] = useState(null);
  const [modelStatus, setModelStatus] = useState("idle"); // idle | downloading | loading | ready | error
  const [modelProgress, setModelProgress] = useState(0);
  const [trustScore, setTrustScore] = useState(null);
  const [verificationHistory, setVerificationHistory] = useState([]);
  const [shardModels, setShardModels] = useState([]);
  const [shardStats, setShardStats] = useState(null);
  const [userShardJobs, setUserShardJobs] = useState([]);

  // Pipeline mode state
  const [pipelineMode, setPipelineMode] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState(null); // null|'joining'|'loading'|'ready'|'processing'
  const [pipelineInfo, setPipelineInfo] = useState(null); // { pipelineId, stageIndex, layerStart, layerEnd, totalStages }
  const [pipelineSlots, setPipelineSlots] = useState([]);

  const workerIdRef = useRef(null);
  const gpuWorkerRef = useRef(null);
  const heartbeatRef = useRef(null);
  const pollRef = useRef(null);
  const timerRef = useRef(null);
  const enabledRef = useRef(false);
  const busyRef = useRef(false);
  const sessionStartRef = useRef(null);

  // Pipeline refs
  const pipelineWorkerRef = useRef(null);
  const pipelineHeartbeatRef = useRef(null);
  const pipelinePollRef = useRef(null);
  const pipelineModeRef = useRef(false);

  // Keep refs in sync
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { pipelineModeRef.current = pipelineMode; }, [pipelineMode]);

  // Earnings rate for this GPU
  const earningsRate = EARNINGS_RATES[gpuClass] || EARNINGS_RATES.unknown;

  // Detect WebGPU on mount
  useEffect(() => {
    async function detectGPU() {
      if (!navigator.gpu) return;
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return;
        const info = await adapter.requestAdapterInfo?.() || {};
        setGpuAvailable(true);
        const renderer = info.description || info.device || "WebGPU Device";
        const vendor = info.vendor || "Unknown";
        setGpuInfo({ vendor, renderer });
        setGpuClass(classifyGpu(renderer));
        adapter.requestDevice().then((d) => d.destroy()).catch(() => {});
      } catch { /* no GPU */ }
    }
    detectGPU();
  }, []);

  const refreshStats = useCallback(async () => {
    if (!userId) {
      // Still fetch public Shard data without userId
      const [sModels, sStats] = await Promise.all([
        fetchShardModels(),
        fetchShardStats(),
      ]);
      setShardModels(sModels);
      if (sStats) setShardStats(sStats);
      return;
    }
    const [stats, mem, net, sModels, sStats, sJobs] = await Promise.all([
      fetchWorkerStats(userId),
      fetchMembership(userId),
      fetchNetworkStats(),
      fetchShardModels(),
      fetchShardStats(),
      fetchUserShardJobs(userId),
    ]);
    if (stats) {
      setWorkerStats(stats);
      setTrustScore({
        score: stats.trust_score ?? 50,
        count: stats.verification_count ?? 0,
        pass: stats.verification_pass ?? 0,
        fail: stats.verification_fail ?? 0,
      });
      // Fetch verification history if we have a worker ID
      if (stats.id) {
        const history = await fetchVerificationHistory(stats.id, 5);
        setVerificationHistory(history);
      }
    }
    if (mem) setMembership(mem);
    if (net) setNetworkStats(net);
    setShardModels(sModels);
    if (sStats) setShardStats(sStats);
    setUserShardJobs(sJobs);
  }, [userId]);

  // Fetch stats on mount (and network stats even without userId)
  useEffect(() => {
    refreshStats();
    // Also fetch network stats for non-logged-in view
    fetchNetworkStats().then((n) => { if (n) setNetworkStats(n); });
  }, [refreshStats]);

  // Ensure worker is created and has model-status handler
  const ensureWorker = useCallback(() => {
    if (!gpuWorkerRef.current) {
      gpuWorkerRef.current = new Worker(
        new URL("../workers/compute-worker.js", import.meta.url),
        { type: "module" }
      );
    }
    return gpuWorkerRef.current;
  }, []);

  // Execute a job via the Web Worker
  const executeJob = useCallback(
    (job) => {
      const worker = ensureWorker();

      setCurrentJob(job);
      setStatus("busy");
      busyRef.current = true;

      worker.onmessage = async (e) => {
        const msg = e.data;

        if (msg.type === "model-status") {
          setModelStatus(msg.status);
          setModelProgress(msg.progress || 0);
          return;
        }

        if (msg.type === "result" && msg.jobId === job.id) {
          const earned = await submitJobResult(
            job.id,
            workerIdRef.current,
            msg.resultEncrypted,
            msg.resultHash
          );
          setJobsThisSession((j) => j + 1);
          if (earned.coins > 0) setCoinsThisSession((c) => c + earned.coins);
          if (earned.usdc > 0) setUsdcThisSession((u) => u + Number(earned.usdc));
          setCurrentJob(null);
          setStatus("idle");
          busyRef.current = false;
          refreshStats();
        } else if (msg.type === "error" && msg.jobId === job.id) {
          console.error("Compute job failed:", msg.error);
          setCurrentJob(null);
          setStatus("idle");
          busyRef.current = false;
        }
      };

      worker.postMessage({
        type: "execute",
        jobId: job.id,
        jobType: job.job_type,
        payload: job.payload_encrypted,
      });
    },
    [ensureWorker, refreshStats]
  );

  // Poll for jobs
  const pollForJob = useCallback(async () => {
    if (!enabledRef.current || !workerIdRef.current || busyRef.current) return;

    const jobId = await claimJob(workerIdRef.current);
    if (!jobId) return;

    const job = await fetchJobPayload(jobId);
    if (job) {
      executeJob(job);
    }
  }, [executeJob]);

  // Toggle compute on/off
  const toggle = useCallback(async () => {
    if (enabled) {
      // Stop
      setEnabled(false);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (workerIdRef.current) {
        await updateWorkerStatus(workerIdRef.current, "offline").catch(() => {});
      }
      if (gpuWorkerRef.current) {
        gpuWorkerRef.current.terminate();
        gpuWorkerRef.current = null;
      }
      setStatus("offline");
      setCurrentJob(null);
      busyRef.current = false;
      sessionStartRef.current = null;
    } else {
      // Start
      if (!userId || !gpuAvailable) return;
      setStarting(true);
      setError(null);

      try {
        const deviceId =
          localStorage.getItem("taste-device-id") ||
          crypto.randomUUID();
        localStorage.setItem("taste-device-id", deviceId);

        // Race against a 10s timeout so we never stalemate
        const worker = await Promise.race([
          registerWorker(userId, deviceId, gpuInfo),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 10000)
          ),
        ]);

        if (!worker) {
          setError("Could not register — run the compute schema in Supabase SQL Editor first.");
          setStarting(false);
          return;
        }

        workerIdRef.current = worker.id;

        // Start model warmup in the Web Worker
        const gpuWorker = ensureWorker();
        gpuWorker.onmessage = (e) => {
          const msg = e.data;
          if (msg.type === "model-status") {
            setModelStatus(msg.status);
            setModelProgress(msg.progress || 0);
          }
        };
        gpuWorker.postMessage({ type: "warmup" });

        // These can fail silently — non-blocking
        await Promise.race([
          initMembership(userId),
          new Promise((r) => setTimeout(r, 5000)),
        ]).catch(() => {});
        await refreshStats().catch(() => {});

        setEnabled(true);
        setStatus("idle");
        setStarting(false);
        sessionStartRef.current = Date.now();
        setSessionElapsed(0);

        // Session timer — tick every second
        timerRef.current = setInterval(() => {
          if (sessionStartRef.current) {
            setSessionElapsed(Math.floor((Date.now() - sessionStartRef.current) / 1000));
          }
        }, 1000);

        // Heartbeat every 30s
        heartbeatRef.current = setInterval(() => {
          if (workerIdRef.current) sendHeartbeat(workerIdRef.current);
        }, 30000);

        // Poll for jobs every 5s
        pollRef.current = setInterval(() => {
          if (enabledRef.current && !busyRef.current) {
            pollForJob();
          }
        }, 5000);

        // Immediate first poll
        pollForJob();
      } catch (err) {
        const msg = err?.message === "timeout"
          ? "Connection timed out. Check that compute tables exist in Supabase."
          : "Failed to connect. Check console for details.";
        console.error("Compute toggle error:", err);
        setError(msg);
        setStarting(false);
      }
    }
  }, [enabled, userId, gpuAvailable, gpuInfo, pollForJob, refreshStats]);

  // ── Pipeline mode toggle ──────────────────────────────────────────
  const togglePipeline = useCallback(async () => {
    if (pipelineMode) {
      // Leave pipeline
      if (pipelineHeartbeatRef.current) clearInterval(pipelineHeartbeatRef.current);
      if (pipelinePollRef.current) clearInterval(pipelinePollRef.current);
      if (workerIdRef.current) {
        await leavePipeline(workerIdRef.current).catch(() => {});
      }
      if (pipelineWorkerRef.current) {
        pipelineWorkerRef.current.terminate();
        pipelineWorkerRef.current = null;
      }
      setPipelineMode(false);
      setPipelineStatus(null);
      setPipelineInfo(null);
      setPipelineSlots([]);
      return;
    }

    // Join pipeline
    if (!userId || !gpuAvailable) return;
    if (enabled) return; // Must stop solo mode first

    setPipelineStatus("joining");
    setError(null);

    try {
      const deviceId =
        localStorage.getItem("taste-device-id") || crypto.randomUUID();
      localStorage.setItem("taste-device-id", deviceId);

      // Register worker if needed
      let workerId = workerIdRef.current;
      if (!workerId) {
        const worker = await Promise.race([
          registerWorker(userId, deviceId, gpuInfo),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000)),
        ]);
        if (!worker) {
          setError("Could not register worker.");
          setPipelineStatus(null);
          return;
        }
        workerId = worker.id;
        workerIdRef.current = workerId;
      }

      // Join pipeline via RPC
      const assignment = await joinPipeline(workerId, "llama-3.1-8b-4shard");
      if (!assignment) {
        setError("Could not join pipeline. Try again.");
        setPipelineStatus(null);
        return;
      }

      const info = {
        pipelineId: assignment.pipeline_id,
        stageIndex: assignment.stage_index,
        layerStart: assignment.layer_start,
        layerEnd: assignment.layer_end,
        totalStages: assignment.total_stages,
      };
      setPipelineInfo(info);
      setPipelineMode(true);
      setPipelineStatus("loading");

      // Create pipeline worker
      pipelineWorkerRef.current = new Worker(
        new URL("../workers/pipeline-worker.js", import.meta.url),
        { type: "module" }
      );

      // Listen for shard loading progress
      pipelineWorkerRef.current.onmessage = async (e) => {
        const msg = e.data;

        if (msg.type === "shard-status") {
          if (msg.status === "ready") {
            setPipelineStatus("ready");
            setModelProgress(100);
          } else if (msg.status === "error") {
            setPipelineStatus(null);
            setPipelineMode(false);
            setError(msg.message || "Failed to load shard");
          } else {
            setModelProgress(msg.progress || 0);
          }
          return;
        }

        if (msg.type === "stage-result") {
          // Intermediate stage: submit activation to next stage
          const hash = await sha256Pipeline(msg.outputActivations);
          await submitActivation(msg.jobId, info.stageIndex, msg.outputActivations, hash);
          busyRef.current = false;
          return;
        }

        if (msg.type === "final-result") {
          // Final stage: complete the pipeline job
          await completePipelineJob(msg.jobId, msg.resultEncrypted, msg.resultHash);
          setJobsThisSession((j) => j + 1);
          // Earnings split across pipeline stages
          const coinsShare = Math.floor(40 / info.totalStages);
          const usdcShare = 0.004 / info.totalStages;
          setCoinsThisSession((c) => c + coinsShare);
          setUsdcThisSession((u) => u + usdcShare);
          busyRef.current = false;
          refreshStats();
          return;
        }

        if (msg.type === "error") {
          console.error("Pipeline stage error:", msg.error);
          busyRef.current = false;
        }
      };

      // Build model URL from config
      const config = assignment.config || {};
      const modelUrl = config.shard_url ||
        `https://storage.example.com/pipeline-shards/llama-8b-layers-${assignment.layer_start}-${assignment.layer_end - 1}.bin`;

      // Send load command to pipeline worker
      pipelineWorkerRef.current.postMessage({
        type: "load-shard",
        stageIndex: assignment.stage_index,
        layerStart: assignment.layer_start,
        layerEnd: assignment.layer_end,
        modelUrl,
        config: {
          ...config,
          total_stages: assignment.total_stages,
        },
      });

      // Start pipeline heartbeat (30s)
      pipelineHeartbeatRef.current = setInterval(() => {
        if (pipelineModeRef.current && info.pipelineId) {
          sendPipelineHeartbeat(info.pipelineId, info.stageIndex);
        }
      }, 30000);

      // Start pipeline polling loop
      pipelinePollRef.current = setInterval(async () => {
        if (!pipelineModeRef.current || busyRef.current) return;

        // Refresh pipeline status for UI
        const status = await fetchPipelineStatus(info.pipelineId);
        if (status) {
          setPipelineSlots(status.slots || []);
          if (status.status === "dissolved" || status.status === "draining") {
            // Pipeline dissolved, leave
            setPipelineMode(false);
            setPipelineStatus(null);
            setPipelineInfo(null);
            setPipelineSlots([]);
            if (pipelineHeartbeatRef.current) clearInterval(pipelineHeartbeatRef.current);
            if (pipelinePollRef.current) clearInterval(pipelinePollRef.current);
            return;
          }
        }

        if (status?.status !== "ready" && status?.status !== "processing") return;

        // Poll for work
        const work = await claimPipelineStage(info.pipelineId, info.stageIndex);
        if (!work) return;

        busyRef.current = true;
        setPipelineStatus("processing");

        // Send to pipeline worker
        pipelineWorkerRef.current.postMessage({
          type: "process-stage",
          jobId: work.job_id,
          inputActivations: info.stageIndex === 0
            ? work.payload_encrypted
            : work.activation_data,
          seqLen: 1,
        });
      }, info.stageIndex === 0 ? 2000 : 200); // Stage 0: 2s, others: 200ms

    } catch (err) {
      console.error("Pipeline toggle error:", err);
      setError(err?.message || "Failed to join pipeline");
      setPipelineStatus(null);
      setPipelineMode(false);
    }
  }, [pipelineMode, enabled, userId, gpuAvailable, gpuInfo, refreshStats]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (gpuWorkerRef.current) gpuWorkerRef.current.terminate();
      if (pipelineWorkerRef.current) pipelineWorkerRef.current.terminate();
      if (pipelineHeartbeatRef.current) clearInterval(pipelineHeartbeatRef.current);
      if (pipelinePollRef.current) clearInterval(pipelinePollRef.current);
      if (workerIdRef.current) {
        updateWorkerStatus(workerIdRef.current, "offline");
      }
    };
  }, []);

  return {
    gpuAvailable,
    gpuInfo,
    gpuClass,
    enabled,
    toggle,
    starting,
    error,
    status,
    currentJob,
    jobsThisSession,
    coinsThisSession,
    usdcThisSession,
    workerStats,
    membership,
    networkStats,
    sessionElapsed,
    earningsRate,
    modelStatus,
    modelProgress,
    trustScore,
    verificationHistory,
    shardModels,
    shardStats,
    userShardJobs,
    refreshStats,
    // Pipeline mode
    pipelineMode,
    pipelineStatus,
    pipelineInfo,
    pipelineSlots,
    togglePipeline,
  };
}
