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
  classifyGpu,
  EARNINGS_RATES,
} from "../api/compute";

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

  const workerIdRef = useRef(null);
  const gpuWorkerRef = useRef(null);
  const heartbeatRef = useRef(null);
  const pollRef = useRef(null);
  const timerRef = useRef(null);
  const enabledRef = useRef(false);
  const busyRef = useRef(false);
  const sessionStartRef = useRef(null);

  // Keep refs in sync
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

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
    if (!userId) return;
    const [stats, mem] = await Promise.all([
      fetchWorkerStats(userId),
      fetchMembership(userId),
    ]);
    if (stats) setWorkerStats(stats);
    if (mem) setMembership(mem);
  }, [userId]);

  // Fetch stats on mount
  useEffect(() => { refreshStats(); }, [refreshStats]);

  // Execute a job via the Web Worker
  const executeJob = useCallback(
    (job) => {
      if (!gpuWorkerRef.current) {
        gpuWorkerRef.current = new Worker(
          new URL("../workers/compute-worker.js", import.meta.url),
          { type: "module" }
        );
      }

      setCurrentJob(job);
      setStatus("busy");
      busyRef.current = true;

      gpuWorkerRef.current.onmessage = async (e) => {
        const msg = e.data;
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

      gpuWorkerRef.current.postMessage({
        type: "execute",
        jobId: job.id,
        jobType: job.job_type,
        payload: job.payload_encrypted,
      });
    },
    [refreshStats]
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
        await updateWorkerStatus(workerIdRef.current, "offline");
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

      const deviceId =
        localStorage.getItem("taste-device-id") ||
        crypto.randomUUID();
      localStorage.setItem("taste-device-id", deviceId);

      const worker = await registerWorker(userId, deviceId, gpuInfo);
      if (!worker) { setStarting(false); return; }

      workerIdRef.current = worker.id;
      await initMembership(userId);
      await refreshStats();

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
    }
  }, [enabled, userId, gpuAvailable, gpuInfo, pollForJob, refreshStats]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (gpuWorkerRef.current) gpuWorkerRef.current.terminate();
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
    status,
    currentJob,
    jobsThisSession,
    coinsThisSession,
    usdcThisSession,
    workerStats,
    membership,
    sessionElapsed,
    earningsRate,
    refreshStats,
  };
}
