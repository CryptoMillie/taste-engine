/**
 * x402 Vote Edge Function
 * POST /x402-vote — agent submits a vote (pays ~$0.001 per vote)
 *
 * Accepts: { winner_id, loser_id, agent_id } + X-402-Payment header
 * Returns: { accepted: true, delta, new_ratings } after payment verified
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VOTE_PRICE = 0.001;
const RECIPIENT = "0xE007561e6dF35759A890471911fD2d8D64a619D5"; // Replace with your USDC wallet

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-402-payment, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function paymentRequired() {
  return new Response(
    JSON.stringify({
      error: "Payment Required",
      description: "Submit one preference vote to Taste Engine",
      price: VOTE_PRICE,
      currency: "USDC",
      network: "base",
      recipient: RECIPIENT,
    }),
    {
      status: 402,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-402-Version": "1",
        "X-402-Price": String(VOTE_PRICE),
        "X-402-Currency": "USDC",
        "X-402-Network": "base",
        "X-402-Recipient": RECIPIENT,
        "X-402-Description": "Submit one preference vote to Taste Engine",
      },
    }
  );
}

function verifyPayment(request: Request): boolean {
  const paymentHeader = request.headers.get("X-402-Payment");
  if (!paymentHeader) return false;
  try {
    const payment = JSON.parse(paymentHeader);
    return (
      payment.amount >= VOTE_PRICE &&
      payment.currency === "USDC" &&
      payment.network === "base"
    );
  } catch {
    return false;
  }
}

async function hashAgentId(agentId: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(agentId + "_taste_engine_salt");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Elo calculation
function expected(ra: number, rb: number): number {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify payment
  if (!verifyPayment(req)) {
    return paymentRequired();
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { winner_id, loser_id, agent_id } = await req.json();

    if (!winner_id || !loser_id || !agent_id) {
      return new Response(
        JSON.stringify({ error: "Missing winner_id, loser_id, or agent_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get current ratings
    const { data: items } = await supabase
      .from("items")
      .select("id, rating, comparisons, wins")
      .in("id", [winner_id, loser_id]);

    if (!items || items.length < 2) {
      return new Response(
        JSON.stringify({ error: "Items not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const winner = items.find((i: any) => i.id === winner_id)!;
    const loser = items.find((i: any) => i.id === loser_id)!;

    const ew = expected(winner.rating, loser.rating);
    const k = Math.min(winner.comparisons, loser.comparisons) < 10 ? 40 : 16;
    const delta = Math.round(k * (1 - ew));

    // Update ratings
    await supabase
      .from("items")
      .update({
        rating: winner.rating + delta,
        comparisons: winner.comparisons + 1,
        wins: winner.wins + 1,
      })
      .eq("id", winner_id);

    await supabase
      .from("items")
      .update({
        rating: loser.rating - delta,
        comparisons: loser.comparisons + 1,
      })
      .eq("id", loser_id);

    // Track agent
    const agentHash = await hashAgentId(agent_id);
    await supabase.from("agents").upsert(
      {
        agent_id_hash: agentHash,
        total_votes: 1,
        total_paid_usdc: VOTE_PRICE,
      },
      { onConflict: "agent_id_hash" }
    );

    // Record vote
    await supabase.from("votes").insert({
      winner_id,
      loser_id,
      quality_score: 1.0, // Agents scored on consistency, not timing
      source: "agent",
      session_id: `agent_${agentHash.slice(0, 12)}`,
    });

    return new Response(
      JSON.stringify({
        accepted: true,
        delta,
        new_ratings: {
          [winner_id]: winner.rating + delta,
          [loser_id]: loser.rating - delta,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
