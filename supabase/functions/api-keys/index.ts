/**
 * api-keys Edge Function
 * CRUD for API keys (Supabase JWT required).
 *
 * POST   — Generate a new API key (returns raw key once)
 * GET    — List keys (prefix, name, usage — never raw key)
 * DELETE — Deactivate a key by id
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

/** SHA-256 hash of a string, returned as hex. */
async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Generate a cryptographically random API key. */
function generateKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `te_live_${hex}`;
}

/** Authenticate user from Supabase JWT. Returns user_id or null. */
async function authenticateUser(
  req: Request,
  supabase: ReturnType<typeof createClient>
): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  if (token.startsWith("te_live_")) return null; // API keys can't manage API keys
  const {
    data: { user },
  } = await supabase.auth.getUser(token);
  return user?.id || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const userId = await authenticateUser(req, supabase);
  if (!userId) {
    return new Response(
      JSON.stringify({ error: "Authentication required (Supabase JWT)" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // ── POST: Create a new API key ──────────────────────────────────
  if (req.method === "POST") {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // name is optional
    }

    const name = body.name || "Default";
    const rawKey = generateKey();
    const keyHash = await sha256(rawKey);
    const keyPrefix = rawKey.slice(0, 16); // "te_live_" + first 8 hex chars

    const { error } = await supabase.from("api_keys").insert({
      user_id: userId,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      name,
    });

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        key: rawKey,
        prefix: keyPrefix,
        name,
        message: "Save this key — it won't be shown again.",
      }),
      {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // ── GET: List keys ──────────────────────────────────────────────
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("api_keys")
      .select("id, key_prefix, name, usage_count, usage_tokens, is_active, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ keys: data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── DELETE: Deactivate a key ────────────────────────────────────
  if (req.method === "DELETE") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { id } = body;
    if (!id) {
      return new Response(
        JSON.stringify({ error: "id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { error } = await supabase
      .from("api_keys")
      .update({ is_active: false })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ error: "Method not allowed" }),
    {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
