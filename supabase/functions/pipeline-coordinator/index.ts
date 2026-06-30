/**
 * Pipeline Coordinator Edge Function
 * Called by pg_cron every minute to monitor pipeline health.
 *
 * Responsibilities:
 * 1. Dissolve stale pipelines (draining for 2+ minutes)
 * 2. Expire old pending pipeline_jobs (5+ minutes)
 * 3. Detect dropped workers (heartbeat > 90s ago)
 * 4. Clean up consumed activations (5+ minutes old)
 *
 * This function delegates to the `cleanup_stale_pipelines()` RPC
 * which performs all operations atomically in the database.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Verify authorization (service role only)
  const authHeader = req.headers.get("Authorization");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!authHeader?.includes(serviceKey || "")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Call the database function that handles all cleanup atomically
    const { data: cleaned, error } = await supabase.rpc("cleanup_stale_pipelines");

    if (error) {
      console.error("Pipeline coordinator error:", error.message);
      return new Response(
        JSON.stringify({ error: error.message, cleaned: 0 }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Also gather pipeline stats for logging
    const { data: stats } = await supabase
      .from("compute_pipelines")
      .select("status")
      .in("status", ["forming", "ready", "processing", "draining"]);

    const pipelineStats = {
      forming: 0,
      ready: 0,
      processing: 0,
      draining: 0,
    };
    if (stats) {
      for (const p of stats) {
        pipelineStats[p.status as keyof typeof pipelineStats]++;
      }
    }

    return new Response(
      JSON.stringify({
        cleaned: cleaned || 0,
        pipelines: pipelineStats,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Pipeline coordinator failed:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
