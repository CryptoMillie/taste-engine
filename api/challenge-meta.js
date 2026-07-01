/**
 * Vercel Serverless Function — OG meta tags for challenge links.
 * Reads item names from the &names= query param for dynamic previews.
 *
 * URL: /api/challenge-meta?challenge=id1,id2&pick=id1&names=Pizza,Sushi
 */

const CRAWLER_PATTERNS = [
  "facebookexternalhit", "Facebot", "Twitterbot", "LinkedInBot",
  "Slackbot", "TelegramBot", "WhatsApp", "Discordbot", "Googlebot",
  "bingbot", "Pinterestbot", "redditbot", "Applebot", "Embedly",
  "Iframely",
];

function isCrawler(ua) {
  if (!ua) return false;
  const lower = ua.toLowerCase();
  return CRAWLER_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default function handler(req, res) {
  const { challenge, names } = req.query;
  if (!challenge) {
    res.writeHead(302, { Location: "/" });
    return res.end();
  }

  const ua = req.headers["user-agent"] || "";

  // Real browsers → redirect to static SPA
  if (!isCrawler(ua)) {
    const qs = new URLSearchParams(req.query).toString();
    res.writeHead(302, { Location: `/index.html?${qs}` });
    return res.end();
  }

  // Parse item names from URL
  const decoded = names ? decodeURIComponent(names) : "";
  const parts = decoded.split(",").map((s) => s.trim()).filter(Boolean);
  const nameA = parts[0] || null;
  const nameB = parts[1] || null;
  const hasNames = nameA && nameB;

  const title = hasNames
    ? esc(`${nameA} vs ${nameB} — which do you prefer?`)
    : esc("You've been challenged — Taste Engine");
  const description = hasNames
    ? esc(`${nameA} or ${nameB}? Someone challenged your taste. Tap to cast your vote.`)
    : esc("Someone challenged your taste. Tap to cast your vote and see if you agree.");

  const origin = `https://${req.headers.host}`;
  const ogImage = hasNames
    ? `${origin}/api/og?a=${encodeURIComponent(nameA)}&b=${encodeURIComponent(nameB)}`
    : `${origin}/og-image.png`;
  const canonicalUrl = `${origin}/?challenge=${challenge}`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Taste Engine" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${ogImage}" />
</head>
<body></body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=86400, max-age=3600");
  res.status(200).send(html);
}
