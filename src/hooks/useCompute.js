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
} from "../api/compute";

/**
 * Hook for GPU compute worker lifecycle.
 *
 * Returns: { gpuAvailable, gpuInfo, enabled, toggle, status,
 *            currentJob, jobsThisSession, coinsThisSession,
 *            workerStats, membership, refreshStats }
 */
export function useCompute(userId) {
  const [gpuAvailable, setGpuAvailable] = useState(false);
  const [gpuInfo, setGpuInfo] = useState({ vendor: "", renderer: "" });
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState("offline"); // offline | idle | busy
  const [currentJob, setCurrentJob] = useState(null);
  const [jobsThisSession, setJobsThisSession] = useState(0);
  const [coinsThisSession, setCoinsThisSession] = useState(0);
  const [workerStats, setWorkerStats] = useState(null);
  const [membership, setMembership] = useState(null);

  const workerIdRef = useRef(null);
  const gpuWorkerRef = useRef(null);
  const heartbeatRef = useRef(null);
  const pollRef = useRef(null);
  const enabledRef = useRef(false);

  // Keep ref in sync
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // Detect WebGPU on mount
  useEffect(() => {
    async function detectGPU() {
      if (!navigator.gpu) return;
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return;
        const info = await adapter.requestAdapterInfo?.() || {};
        setGpuAvailable(true);
        setGpuInfo({
          vendor: info.vendor || "Unknown",
          renderer: info.description || info.device || "WebGPU Device",
        });
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
  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

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
          if (earned > 0) setCoinsThisSession((c) => c + earned);
          setCurrentJob(null);
          setStatus("idle");
          refreshStats();
        } else if (msg.type === "error" && msg.jobId === job.id) {
          console.error("Compute job failed:", msg.error);
          setCurrentJob(null);
          setStatus("idle");
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
    if (!enabledRef.current || !workerIdRef.current) return;

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
      if (workerIdRef.current) {
        await updateWorkerStatus(workerIdRef.current, "offline");
      }
      if (gpuWorkerRef.current) {
        gpuWorkerRef.current.terminate();
        gpuWorkerRef.current = null;
      }
      setStatus("offline");
      setCurrentJob(null);
    } else {
      // Start
      if (!userId || !gpuAvailable) return;

      const deviceId =
        localStorage.getItem("taste-device-id") ||
        crypto.randomUUID();
      localStorage.setItem("taste-device-id", deviceId);

      const worker = await registerWorker(userId, deviceId, gpuInfo);
      if (!worker) return;

      workerIdRef.current = worker.id;
      await initMembership(userId);
      await refreshStats();

      setEnabled(true);
      setStatus("idle");

      // Heartbeat every 30s
      heartbeatRef.current = setInterval(() => {
        if (workerIdRef.current) sendHeartbeat(workerIdRef.current);
      }, 30000);

      // Poll for jobs every 5s
      pollRef.current = setInterval(() => {
        if (enabledRef.current && !currentJob) {
          pollForJob();
        }
      }, 5000);

      // Immediate first poll
      pollForJob();
    }
  }, [enabled, userId, gpuAvailable, gpuInfo, currentJob, pollForJob, refreshStats]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      if (gpuWorkerRef.current) gpuWorkerRef.current.terminate();
      if (workerIdRef.current) {
        updateWorkerStatus(workerIdRef.current, "offline");
      }
    };
  }, []);

  return {
    gpuAvailable,
    gpuInfo,
    enabled,
    toggle,
    status,
    currentJob,
    jobsThisSession,
    coinsThisSession,
    workerStats,
    membership,
    refreshStats,
  };
}
