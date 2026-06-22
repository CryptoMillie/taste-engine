/**
 * x402 Data Edge Function
 * Provides paid access to Taste Engine data for AI agents.
 *
 * Endpoints:
 *   GET  /x402-data/rankings          — full ranked list ($0.01/req)
 *   GET  /x402-data/campaign/:id      — campaign results ($0.05/req)
 *   GET  /x402-data/taste-profile     — cross-category correlations ($0.10/req)
 *   GET  /x402-data/compare?a=X&b=Y   — head-to-head stats ($0.005/req)
 *   POST /x402-data/taste-insights    — AI taste analysis ($0.08/req)
 *   POST /x402-data/expand            — AI category expansion ($0.05/req)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RECIPIENT = "0xE007561e6dF35759A890471911fD2d8D64a619D5";

const CHUTES_URL = "https://api.chutes.ai/v1/chat/completions";
const CHUTES_MODEL = "deepseek-ai/DeepSeek-V3-0324";

const PRICES: Record<string, number> = {
  rankings: 0.01,
  campaign: 0.05,
  "taste-profile": 0.1,
  compare: 0.005,
  "taste-insights": 0.08,
  expand: 0.05,
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-402-payment, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function paymentRequired(price: number, description: string) {
  return new Response(
    JSON.stringify({
      error: "Payment Required",
      description,
      price,
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
        "X-402-Price": String(price),
        "X-402-Currency": "USDC",
        "X-402-Network": "base",
        "X-402-Recipient": RECIPIENT,
        "X-402-Description": description,
      },
    }
  );
}

function verifyPayment(request: Request, expectedPrice: number): boolean {
  const paymentHeader = request.headers.get("X-402-Payment");
  if (!paymentHeader) return false;
  try {
    const payment = JSON.parse(paymentHeader);
    return payment.amount >= expectedPrice && payment.currency === "USDC";
  } catch {
    return false;
  }
}

/**
 * Call Chutes inference (server-side, key from env).
 */
async function chutesInfer(
  systemPrompt: string,
  userPrompt: string
): Promise<any | null> {
  const key = Deno.env.get("CHUTES_API_KEY");
  if (!key) return null;

  try {
    const res = await fetch(CHUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: CHUTES_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 600,
        temperature: 0.7,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    const jsonMatch = content.match(/[\[{][\s\S]*[\]}]/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const isGet = req.method === "GET";
  const isPost = req.method === "POST";

  if (!isGet && !isPost) {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // Expected: ["x402-data", "rankings"] or ["x402-data", "campaign", ":id"]
  const endpoint = pathParts[1] ?? "";
  const param = pathParts[2] ?? "";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const json = (data: any, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // --- Rankings (GET) ---
    if (endpoint === "rankings" && isGet) {
      const price = PRICES.rankings;
      if (!verifyPayment(req, price)) {
        return paymentRequired(price, "Full ranked list of all items");
      }

      const { data: items } = await supabase
        .from("items")
        .select("id, name, sub, cat, rating, comparisons, wins")
        .order("rating", { ascending: false });

      return json({ items: items ?? [], count: items?.length ?? 0 });
    }

    // --- Campaign results (GET) ---
    if (endpoint === "campaign" && param && isGet) {
      const price = PRICES.campaign;
      if (!verifyPayment(req, price)) {
        return paymentRequired(price, `Campaign results for ${param}`);
      }

      const { data: campaign } = await supabase
        .from("campaigns")
        .select("*")
        .eq("id", param)
        .single();

      if (!campaign) return json({ error: "Campaign not found" }, 404);

      const { data: votes } = await supabase
        .from("votes")
        .select("winner_id, loser_id, quality_score, source")
        .eq("campaign_id", param);

      // Calculate win rates for campaign items
      const { data: campaignItems } = await supabase
        .from("campaign_items")
        .select("item_id")
        .eq("campaign_id", param);

      const itemIds = (campaignItems ?? []).map((ci: any) => ci.item_id);
      const stats: Record<string, { wins: number; losses: number; matchups: number }> = {};

      for (const id of itemIds) {
        stats[id] = { wins: 0, losses: 0, matchups: 0 };
      }

      for (const vote of votes ?? []) {
        if (stats[vote.winner_id]) {
          stats[vote.winner_id].wins++;
          stats[vote.winner_id].matchups++;
        }
        if (stats[vote.loser_id]) {
          stats[vote.loser_id].losses++;
          stats[vote.loser_id].matchups++;
        }
      }

      return json({
        campaign,
        total_votes: votes?.length ?? 0,
        item_stats: stats,
      });
    }

    // --- Taste profile (GET) ---
    if (endpoint === "taste-profile" && isGet) {
      const price = PRICES["taste-profile"];
      if (!verifyPayment(req, price)) {
        return paymentRequired(price, "Cross-category taste correlations");
      }

      const { data: votes } = await supabase
        .from("votes")
        .select("winner_id, loser_id, quality_score")
        .gte("quality_score", 0.6)
        .eq("source", "human");

      const { data: items } = await supabase
        .from("items")
        .select("id, cat");

      const catMap: Record<string, string> = {};
      for (const item of items ?? []) {
        catMap[item.id] = item.cat;
      }

      // Build cross-category preference matrix
      const matrix: Record<string, Record<string, number>> = {};
      for (const vote of votes ?? []) {
        const wCat = catMap[vote.winner_id];
        const lCat = catMap[vote.loser_id];
        if (wCat && lCat && wCat !== lCat) {
          if (!matrix[wCat]) matrix[wCat] = {};
          matrix[wCat][lCat] = (matrix[wCat][lCat] || 0) + 1;
        }
      }

      return json({ correlations: matrix, total_cross_votes: votes?.length ?? 0 });
    }

    // --- Head-to-head compare (GET) ---
    if (endpoint === "compare" && isGet) {
      const price = PRICES.compare;
      if (!verifyPayment(req, price)) {
        return paymentRequired(price, "Head-to-head comparison stats");
      }

      const a = url.searchParams.get("a");
      const b = url.searchParams.get("b");

      if (!a || !b) return json({ error: "Missing ?a=X&b=Y params" }, 400);

      const { data: votes } = await supabase
        .from("votes")
        .select("winner_id, loser_id, quality_score")
        .or(
          `and(winner_id.eq.${a},loser_id.eq.${b}),and(winner_id.eq.${b},loser_id.eq.${a})`
        );

      let aWins = 0;
      let bWins = 0;

      for (const v of votes ?? []) {
        if (v.winner_id === a) aWins++;
        else bWins++;
      }

      const { data: items } = await supabase
        .from("items")
        .select("id, name, rating")
        .in("id", [a, b]);

      return json({
        matchups: (votes?.length ?? 0),
        results: { [a]: aWins, [b]: bWins },
        items: items ?? [],
      });
    }

    // --- Taste insights (AI-powered) ---
    if (endpoint === "taste-insights" && isPost) {
      const price = PRICES["taste-insights"];
      if (!verifyPayment(req, price)) {
        return paymentRequired(price, "AI-powered taste analysis from voting data");
      }

      // Get all items with ratings
      const { data: items } = await supabase
        .from("items")
        .select("id, name, cat, rating, comparisons, wins")
        .gt("comparisons", 0)
        .order("rating", { ascending: false });

      if (!items?.length) {
        return json({ error: "No voting data available" }, 404);
      }

      // Build category stats
      const catStats: Record<string, { wins: number; seen: number; rate: string }> = {};
      for (const item of items) {
        if (!catStats[item.cat]) catStats[item.cat] = { wins: 0, seen: 0, rate: "0%" };
        catStats[item.cat].wins += item.wins;
        catStats[item.cat].seen += item.comparisons;
      }
      for (const cat of Object.keys(catStats)) {
        const s = catStats[cat];
        s.rate = s.seen > 0 ? Math.round((s.wins / s.seen) * 100) + "%" : "0%";
      }

      const topItems = items.slice(0, 20).map(
        (i: any) => `${i.name} (${i.cat}, rating: ${i.rating}, ${i.wins}/${i.comparisons} wins)`
      );

      const result = await chutesInfer(
        "You are a taste analyst for a preference ranking engine. Analyze collective voting patterns and provide insights.",
        `Global voting data:
Category stats: ${JSON.stringify(catStats)}

Top rated items:
${topItems.join("\n")}

Total items with votes: ${items.length}

Return JSON:
{
  "summary": "2-3 sentence analysis of collective taste patterns",
  "topTrends": ["3 notable preference trends"],
  "surprises": ["2 unexpected or contrarian patterns"],
  "predictions": ["3 items/categories likely to rise"],
  "categoryRankings": {"category": "one-line insight"}
}`
      );

      if (!result) {
        return json({ error: "Inference unavailable" }, 503);
      }

      return json({
        insights: result,
        data: { categoryStats: catStats, topItems: items.slice(0, 10) },
      });
    }

    // --- Expand category (AI-powered) ---
    if (endpoint === "expand" && isPost) {
      const price = PRICES.expand;
      if (!verifyPayment(req, price)) {
        return paymentRequired(price, "AI-suggested new items for a category");
      }

      let body: any;
      try {
        body = await req.json();
      } catch {
        return json({ error: "Invalid JSON body" }, 400);
      }

      const category = body.category;
      if (!category) {
        return json({ error: "Missing 'category' in request body" }, 400);
      }

      // Get existing items in this category
      const { data: existing } = await supabase
        .from("items")
        .select("name")
        .eq("cat", category);

      const existingNames = (existing ?? []).map((i: any) => i.name);

      const result = await chutesInfer(
        "You suggest trending, interesting entities for a taste/preference ranking app. Only suggest real, well-known entities that people would have opinions about.",
        `Category: ${category}
Already in pool: ${existingNames.slice(0, 30).join(", ")}

Suggest 10 new ${category} items NOT in the list above. Pick things currently relevant, popular, or conversation-worthy.

Return JSON array: [{"name": "exact name", "desc": "2-4 word description"}]`
      );

      if (!result) {
        return json({ error: "Inference unavailable" }, 503);
      }

      return json({ category, suggestions: result });
    }

    return json({ error: "Unknown endpoint", available: Object.keys(PRICES) }, 404);
  } catch (err) {
    console.error("x402-data error:", err);
    return json({ error: "Internal error" }, 500);
  }
});
