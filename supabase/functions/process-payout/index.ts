/**
 * process-payout Edge Function
 * Processes pending USDC payouts on Base chain.
 *
 * Flow:
 * 1. Fetches all pending payouts with connected wallet addresses
 * 2. Deducts 10% platform fee
 * 3. Sends 90% USDC to user's wallet on Base
 * 4. Marks payout as completed with tx hash
 *
 * Can be called via cron or manually:
 *   curl -X POST <SUPABASE_URL>/functions/v1/process-payout \
 *     -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
 *
 * Required env vars:
 *   PLATFORM_WALLET_PRIVATE_KEY — hex private key of the platform hot wallet
 *   BASE_RPC_URL — Base chain RPC (default: https://mainnet.base.org)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ethers } from "https://esm.sh/ethers@6.13.1";

// USDC on Base (6 decimals)
const USDC_BASE_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PLATFORM_FEE_RATE = 0.10; // 10%

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

  const privateKey = Deno.env.get("PLATFORM_WALLET_PRIVATE_KEY");
  const rpcUrl = Deno.env.get("BASE_RPC_URL") || "https://mainnet.base.org";

  if (!privateKey) {
    return new Response(
      JSON.stringify({ error: "PLATFORM_WALLET_PRIVATE_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Fetch pending payouts joined with user wallet addresses
  const { data: payouts, error: fetchErr } = await supabase
    .from("payouts")
    .select("id, user_id, amount_usdc, users!inner(wallet_address)")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(10); // process 10 at a time

  if (fetchErr) {
    return new Response(
      JSON.stringify({ error: fetchErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!payouts || payouts.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, processed: 0, message: "No pending payouts" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Connect to Base
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const usdc = new ethers.Contract(USDC_BASE_ADDRESS, ERC20_ABI, wallet);

  // Check platform USDC balance
  const platformBalance = await usdc.balanceOf(wallet.address);
  const platformBalanceUsdc = Number(ethers.formatUnits(platformBalance, 6));
  console.log(`Platform wallet: ${wallet.address}, USDC balance: ${platformBalanceUsdc}`);

  const results: any[] = [];

  for (const payout of payouts) {
    const walletAddress = (payout as any).users?.wallet_address;
    const payoutId = payout.id;
    const grossAmount = Number(payout.amount_usdc);

    // Skip if no wallet connected
    if (!walletAddress || walletAddress.length < 26) {
      await supabase
        .from("payouts")
        .update({ status: "failed" })
        .eq("id", payoutId);
      results.push({ id: payoutId, status: "failed", reason: "no_wallet" });
      continue;
    }

    // Validate it's a valid EVM address
    if (!ethers.isAddress(walletAddress)) {
      await supabase
        .from("payouts")
        .update({ status: "failed" })
        .eq("id", payoutId);
      results.push({ id: payoutId, status: "failed", reason: "invalid_address" });
      continue;
    }

    // Calculate fee and net payout
    const fee = grossAmount * PLATFORM_FEE_RATE;
    const netAmount = grossAmount - fee;

    if (netAmount <= 0) {
      await supabase
        .from("payouts")
        .update({ status: "failed" })
        .eq("id", payoutId);
      results.push({ id: payoutId, status: "failed", reason: "amount_too_small" });
      continue;
    }

    // Convert to USDC units (6 decimals)
    const amountUnits = ethers.parseUnits(netAmount.toFixed(6), 6);

    // Check balance
    const currentBalance = await usdc.balanceOf(wallet.address);
    if (currentBalance < amountUnits) {
      console.error(`Insufficient USDC for payout ${payoutId}: need ${netAmount}, have ${ethers.formatUnits(currentBalance, 6)}`);
      results.push({ id: payoutId, status: "skipped", reason: "insufficient_balance" });
      continue;
    }

    // Mark as processing
    await supabase
      .from("payouts")
      .update({ status: "processing" })
      .eq("id", payoutId);

    try {
      // Send USDC
      const tx = await usdc.transfer(walletAddress, amountUnits);
      console.log(`Payout ${payoutId}: tx ${tx.hash} — $${netAmount.toFixed(4)} to ${walletAddress} (fee: $${fee.toFixed(4)})`);

      // Wait for confirmation
      const receipt = await tx.wait(1);

      if (receipt && receipt.status === 1) {
        // Deduct the gross amount from user's earned balance
        // (fee stays in platform wallet, net was sent to user)
        const { data: userData } = await supabase
          .from("users")
          .select("total_earned_usdc")
          .eq("id", payout.user_id)
          .single();

        const currentEarnings = Number(userData?.total_earned_usdc || 0);
        await supabase
          .from("users")
          .update({
            total_earned_usdc: Math.max(0, currentEarnings - grossAmount),
          })
          .eq("id", payout.user_id);

        await supabase
          .from("payouts")
          .update({
            status: "completed",
            tx_hash: tx.hash,
          })
          .eq("id", payoutId);

        results.push({
          id: payoutId,
          status: "completed",
          tx: tx.hash,
          gross: grossAmount,
          fee: fee,
          net: netAmount,
        });
      } else {
        await supabase
          .from("payouts")
          .update({ status: "failed", tx_hash: tx.hash })
          .eq("id", payoutId);
        results.push({ id: payoutId, status: "failed", reason: "tx_reverted", tx: tx.hash });
      }
    } catch (err: any) {
      console.error(`Payout ${payoutId} failed:`, err.message);
      await supabase
        .from("payouts")
        .update({ status: "failed" })
        .eq("id", payoutId);
      results.push({ id: payoutId, status: "failed", reason: err.message });
    }
  }

  const summary = {
    ok: true,
    processed: results.length,
    completed: results.filter((r) => r.status === "completed").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
    platformWallet: wallet.address,
  };

  console.log("Payout processing complete:", JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
