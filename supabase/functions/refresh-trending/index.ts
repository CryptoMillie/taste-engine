/**
 * refresh-trending Edge Function
 * Runs daily at 11am UTC via pg_cron to pull fresh trending entities
 * from DeSearch + Chutes AI + Wikipedia into the items table.
 *
 * Can also be invoked manually:
 *   curl -X POST <SUPABASE_URL>/functions/v1/refresh-trending \
 *     -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DESEARCH_URL = "https://api.desearch.ai/api/v1/search/web";
const WIKI_SUMMARY_URL = "https://en.wikipedia.org/api/rest_v1/page/summary";
const CHUTES_URL =
  "https://chutes-deepseek-ai-deepseek-v3-2-tee.chutes.ai/v1/chat/completions";
const CHUTES_MODEL = "deepseek-ai/DeepSeek-V3.2-TEE";

const CATEGORY_QUERIES: Record<string, string> = {
  trending:
    "most famous celebrities trending right now site:wikipedia.org",
  sports: "top athletes and sports stars 2026 site:wikipedia.org",
  music: "popular musicians and singers trending 2026 site:wikipedia.org",
  food: "most popular foods and dishes worldwide site:wikipedia.org",
  movies: "top trending movies and TV shows 2026 site:wikipedia.org",
  anime: "top trending anime series and characters 2026 site:wikipedia.org",
  gaming: "most popular video games and esports 2026 site:wikipedia.org",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── helpers ──────────────────────────────────────────────────────────

async function fetchWikiEntity(
  name: string
): Promise<{ name: string; sub: string; img: string } | null> {
  try {
    const encoded = encodeURIComponent(name.replace(/\s+/g, "_"));
    const res = await fetch(`${WIKI_SUMMARY_URL}/${encoded}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.thumbnail?.source) return null;
    return {
      name: data.titles?.normalized || name,
      sub: (data.description || "").toUpperCase().slice(0, 60),
      img: data.thumbnail.source.replace(/\/\d+px-/, "/640px-"),
    };
  } catch {
    return null;
  }
}

async function extractNamesWithAI(
  results: any[],
  category: string,
  chutesKey: string
): Promise<string[]> {
  const snippets = results
    .slice(0, 8)
    .map((r: any) => `${r.title || ""}: ${r.snippet || r.description || ""}`)
    .join("\n");

  try {
    const res = await fetch(CHUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${chutesKey}`,
      },
      body: JSON.stringify({
        model: CHUTES_MODEL,
        messages: [
          {
            role: "system",
            content:
              "Extract real, specific entity names from search results. Only include names of actual people, places, foods, movies, cars, or animals that have their own Wikipedia page. No generic terms.",
          },
          {
            role: "user",
            content: `Category: ${category}\n\nSearch results:\n${snippets}\n\nReturn ONLY a JSON array of 8-12 specific entity names. Example: ["Caitlin Clark", "Patrick Mahomes"]. No descriptions, no commentary.`,
          },
        ],
        max_tokens: 200,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      console.error(`Chutes error for ${category}: ${res.status} ${await res.text()}`);
      return [];
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return [];

    const match = content.match(/\[[\s\S]*?\]/);
    if (!match) return [];

    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed))
      return parsed.filter((n: any) => typeof n === "string" && n.length > 2);
    return [];
  } catch (err) {
    console.error(`Chutes extraction failed for ${category}:`, err);
    return [];
  }
}

async function fetchCategoryFromDesearch(
  category: string,
  desearchKey: string,
  chutesKey: string,
  count = 8
): Promise<any[]> {
  const query = CATEGORY_QUERIES[category];
  if (!query) return [];

  try {
    // Try the v1 API endpoint first
    const url = `${DESEARCH_URL}?query=${encodeURIComponent(query)}&num=15`;
    let res = await fetch(url, {
      headers: { Authorization: `Bearer ${desearchKey}` },
    });

    // Fallback: try without Bearer prefix (some DeSearch versions)
    if (res.status === 401 || res.status === 403) {
      console.log(`Retrying ${category} with raw key auth...`);
      res = await fetch(url, {
        headers: { Authorization: desearchKey },
      });
    }

    // Fallback: try the old /web endpoint
    if (!res.ok) {
      const fallbackUrl = `https://api.desearch.ai/web?query=${encodeURIComponent(query)}&num=15`;
      console.log(`Trying fallback /web endpoint for ${category}...`);
      res = await fetch(fallbackUrl, {
        headers: { Authorization: desearchKey },
      });
      if (!res.ok) {
        // Try with Bearer prefix on fallback
        res = await fetch(fallbackUrl, {
          headers: { Authorization: `Bearer ${desearchKey}` },
        });
      }
    }

    if (!res.ok) {
      const body = await res.text();
      console.error(`DeSearch error for ${category}: ${res.status} ${body}`);
      return [];
    }

    const data = await res.json();
    const results =
      data.data || data.results || data.organic_results || data.web?.results || [];
    if (!results.length) {
      console.warn(`DeSearch returned 0 results for ${category}. Response keys: ${Object.keys(data).join(", ")}`);
      return [];
    }

    console.log(`DeSearch returned ${results.length} results for ${category}`);

    // Use AI to extract clean entity names
    const names = await extractNamesWithAI(results, category, chutesKey);
    if (!names.length) {
      console.warn(`AI extraction returned 0 names for ${category}`);
      return [];
    }

    console.log(`Extracted ${names.length} names for ${category}: ${names.join(", ")}`);

    // Resolve via Wikipedia
    const resolved = await Promise.allSettled(
      names.slice(0, count + 4).map((name) => fetchWikiEntity(name))
    );

    return resolved
      .filter((r) => r.status === "fulfilled" && r.value)
      .map((r: any) => ({
        ...r.value,
        cat: category === "trending" ? "trending" : category,
        sub: r.value.sub || category.toUpperCase(),
      }))
      .slice(0, count);
  } catch (err) {
    console.error(`DeSearch fetch failed for ${category}:`, err);
    return [];
  }
}

// ── main handler ─────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const desearchKey = Deno.env.get("DESEARCH_API_KEY");
  const chutesKey = Deno.env.get("CHUTES_API_KEY");

  if (!desearchKey || !chutesKey) {
    const missing = [];
    if (!desearchKey) missing.push("DESEARCH_API_KEY");
    if (!chutesKey) missing.push("CHUTES_API_KEY");
    console.error(`Missing env vars: ${missing.join(", ")}`);
    return new Response(
      JSON.stringify({ error: "Missing API keys", missing }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log("Starting trending refresh...");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Fetch all categories in parallel
  const categories = Object.keys(CATEGORY_QUERIES);
  const results = await Promise.allSettled(
    categories.map((cat) =>
      fetchCategoryFromDesearch(cat, desearchKey, chutesKey, 8)
    )
  );

  const allItems: any[] = [];
  const categoryResults: Record<string, number> = {};

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    const result = results[i];
    if (result.status === "fulfilled" && result.value.length) {
      allItems.push(...result.value);
      categoryResults[cat] = result.value.length;
    } else {
      categoryResults[cat] = 0;
      if (result.status === "rejected") {
        console.error(`Category ${cat} rejected:`, result.reason);
      }
    }
  }

  console.log(`Fetched ${allItems.length} total items:`, categoryResults);

  if (allItems.length === 0) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "No items fetched from any category",
        categoryResults,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Deduplicate by name
  const seen = new Set<string>();
  const unique = allItems.filter((item) => {
    const key = item.name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Upsert into items table with stable IDs
  // Uses RPC to preserve existing rating/comparisons/wins for items that already exist
  const rows = unique.map((item) => ({
    id: `ds_${item.cat}_${item.name.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 40)}`,
    name: item.name,
    sub: item.sub,
    cat: item.cat,
    img: item.img,
  }));

  let upsertErrors = 0;
  for (const row of rows) {
    const { error } = await supabase.rpc("upsert_trending_item", {
      p_id: row.id,
      p_name: row.name,
      p_sub: row.sub || "",
      p_cat: row.cat,
      p_img: row.img || "",
    });
    if (error) {
      console.error(`RPC upsert failed for ${row.id}:`, error.message);
      upsertErrors++;
    }
  }

  if (upsertErrors === rows.length && rows.length > 0) {
    // All RPC calls failed — fall back to bulk upsert (without rating/comparisons/wins)
    console.warn("All RPC upserts failed, trying bulk insert with ignoreDuplicates...");
    const fallbackRows = rows.map((r) => ({
      ...r,
      rating: 1200,
      comparisons: 0,
      wins: 0,
      source: "desearch",
      refreshed_at: new Date().toISOString(),
    }));
    const { error: fallbackError } = await supabase
      .from("items")
      .upsert(fallbackRows, { onConflict: "id", ignoreDuplicates: true });
    if (fallbackError) {
      console.error("Fallback upsert also failed:", fallbackError);
      return new Response(
        JSON.stringify({ ok: false, error: fallbackError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  const summary = {
    ok: true,
    itemsUpserted: unique.length,
    categoryResults,
    timestamp: new Date().toISOString(),
  };

  console.log("Refresh complete:", summary);

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
