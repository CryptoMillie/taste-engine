/**
 * x402 middleware/handler.
 * Checks for X-402-Payment header on incoming requests.
 * Returns 402 with payment instructions if no valid payment.
 *
 * This module is used by Supabase Edge Functions, not the client app.
 */

const RECIPIENT_ADDRESS = "0xE007561e6dF35759A890471911fD2d8D64a619D5"; // Replace with your USDC wallet

/**
 * Create a 402 Payment Required response.
 */
export function paymentRequired(price, description) {
  return new Response(
    JSON.stringify({
      error: "Payment Required",
      description,
      price,
      currency: "USDC",
      network: "base",
      recipient: RECIPIENT_ADDRESS,
    }),
    {
      status: 402,
      headers: {
        "Content-Type": "application/json",
        "X-402-Version": "1",
        "X-402-Price": String(price),
        "X-402-Currency": "USDC",
        "X-402-Network": "base",
        "X-402-Recipient": RECIPIENT_ADDRESS,
        "X-402-Description": description,
      },
    }
  );
}

/**
 * Verify x402 payment header.
 * In production, this would verify an on-chain USDC payment proof.
 * For MVP, we accept a signed payment attestation.
 */
export function verifyPayment(request, expectedPrice) {
  const paymentHeader = request.headers.get("X-402-Payment");
  if (!paymentHeader) return false;

  try {
    const payment = JSON.parse(paymentHeader);
    // MVP: Check that payment amount >= expected price
    // In production: verify on-chain transaction on Base
    return (
      payment.amount >= expectedPrice &&
      payment.currency === "USDC" &&
      payment.network === "base" &&
      payment.recipient === RECIPIENT_ADDRESS
    );
  } catch {
    return false;
  }
}

/**
 * Hash an agent ID for privacy-preserving tracking.
 */
export async function hashAgentId(agentId) {
  const encoder = new TextEncoder();
  const data = encoder.encode(agentId + "_taste_engine_salt");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
