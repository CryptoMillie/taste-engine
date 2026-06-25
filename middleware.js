/**
 * Vercel Edge Middleware — runs BEFORE static file serving.
 *
 * Intercepts requests with ?poll= or ?challenge= query params and rewrites
 * crawler requests to the appropriate meta handler so social platforms
 * (Facebook, Twitter/X, LinkedIn, etc.) get the correct OG tags + image.
 *
 * Real browsers are left alone — they get the SPA as usual.
 */

const CRAWLER_PATTERNS = [
  "facebookexternalhit",
  "facebot",
  "twitterbot",
  "linkedinbot",
  "slackbot",
  "telegrambot",
  "whatsapp",
  "discordbot",
  "googlebot",
  "bingbot",
  "pinterestbot",
  "redditbot",
  "applebot",
  "embedly",
  "quora link preview",
  "showyoubot",
  "outbrain",
  "vkshare",
  "w3c_validator",
  "iframely",
  "developers.google.com",
];

function isCrawler(ua) {
  if (!ua) return false;
  const lower = ua.toLowerCase();
  return CRAWLER_PATTERNS.some((p) => lower.includes(p));
}

export default function middleware(request) {
  const url = new URL(request.url);

  // Only intercept root path requests from crawlers
  if (url.pathname !== "/" && url.pathname !== "") return;

  const ua = request.headers.get("user-agent") || "";
  if (!isCrawler(ua)) return;

  const poll = url.searchParams.get("poll");
  const challenge = url.searchParams.get("challenge");

  if (poll) {
    url.pathname = "/api/poll-meta";
    return Response.redirect(url.toString(), 302);
  }

  if (challenge) {
    url.pathname = "/api/challenge-meta";
    return Response.redirect(url.toString(), 302);
  }
}

export const config = {
  matcher: "/",
};
