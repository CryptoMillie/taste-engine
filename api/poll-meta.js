/**
 * Vercel Serverless Function — Social sharing OG meta handler.
 *
 * Crawlers (Facebook, Twitter/X, LinkedIn, etc.) get a lightweight HTML page
 * packed with OG tags + the dynamic og:image URL.
 *
 * Real browsers get a 302 redirect to /index.html?poll=... which serves
 * the static SPA build directly (bypasses the rewrite rule).
 */

const POLLS = {
  "poll-jordan-lebron": { a: "Michael Jordan", b: "LeBron James", label: "The GOAT debate" },
  "poll-messi-ronaldo": { a: "Lionel Messi", b: "Cristiano Ronaldo", label: "Football's eternal rivalry" },
  "poll-brady-montana": { a: "Tom Brady", b: "Joe Montana", label: "NFL quarterback GOAT" },
  "poll-pizza-nuggets": { a: "Pizza", b: "Chicken Nuggets", label: "Ultimate comfort food" },
  "poll-sushi-tacos": { a: "Sushi", b: "Tacos", label: "Best handheld meal" },
  "poll-chocolate-icecream": { a: "Chocolate", b: "Ice Cream", label: "Sweet tooth showdown" },
  "poll-coffee-tea": { a: "Coffee", b: "Tea", label: "Morning ritual" },
  "poll-iphone-android": { a: "iPhone", b: "Android", label: "The phone war" },
  "poll-playstation-xbox": { a: "PlayStation", b: "Xbox", label: "Console wars" },
  "poll-windows-mac": { a: "Windows", b: "macOS", label: "Desktop OS battle" },
  "poll-einstein-newton": { a: "Albert Einstein", b: "Isaac Newton", label: "Greatest scientist ever" },
  "poll-batman-superman": { a: "Batman", b: "Superman", label: "Who wins in a fight?" },
  "poll-marvel-dc": { a: "Marvel", b: "DC", label: "Comic universe showdown" },
  "poll-swift-beyonce": { a: "Taylor Swift", b: "Beyoncé", label: "Pop queen crown" },
  "poll-dog-cat": { a: "Dog", b: "Cat", label: "The eternal pet debate" },
  "poll-shark-lion": { a: "Great White Shark", b: "Lion", label: "Apex predator face-off" },
  "poll-eagle-wolf": { a: "Bald Eagle", b: "Wolf", label: "Spirit animal pick" },
  "poll-honda-toyota": { a: "Honda", b: "Toyota", label: "Reliability king" },
  "poll-lambo-ferrari": { a: "Lamborghini", b: "Ferrari", label: "Dream car duel" },
  "poll-tesla-porsche": { a: "Tesla", b: "Porsche", label: "Future vs heritage" },
};

// Common social media / SEO crawler user-agent fragments
const CRAWLER_PATTERNS = [
  "facebookexternalhit",
  "Facebot",
  "Twitterbot",
  "LinkedInBot",
  "Slackbot",
  "TelegramBot",
  "WhatsApp",
  "Discordbot",
  "Googlebot",
  "bingbot",
  "Pinterestbot",
  "redditbot",
  "Applebot",
  "Embedly",
  "Quora Link Preview",
  "Showyoubot",
  "outbrain",
  "vkShare",
  "W3C_Validator",
  "Iframely",
  "developers.google.com",
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
  const { poll } = req.query;
  const data = poll ? POLLS[poll] : null;

  if (!data) {
    res.writeHead(302, { Location: "/" });
    return res.end();
  }

  const ua = req.headers["user-agent"] || "";

  // Real browsers → redirect to static SPA (bypasses the rewrite)
  if (!isCrawler(ua)) {
    res.writeHead(302, { Location: `/index.html?poll=${poll}` });
    return res.end();
  }

  // Crawlers → serve OG meta tags
  const title = esc(`${data.a} vs ${data.b} — ${data.label}`);
  const description = esc(`${data.a} or ${data.b}? Cast your vote on Taste Engine.`);
  const origin = `https://${req.headers.host}`;
  const ogImage = `${origin}/api/og?poll=${poll}`;
  const canonicalUrl = `${origin}/?poll=${poll}`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title} | Taste Engine</title>
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
