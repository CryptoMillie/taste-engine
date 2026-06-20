/**
 * Vercel Serverless Function — Returns index.html with poll-specific OG meta tags.
 * Social crawlers (Facebook, Twitter, etc.) get personalized previews.
 * URL: /api/poll-meta?poll=poll-jordan-lebron
 */
import { readFileSync } from "fs";
import { join } from "path";

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

function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

let cachedHtml = null;

export default function handler(req, res) {
  const { poll } = req.query;
  const data = poll ? POLLS[poll] : null;

  if (!data) {
    res.writeHead(302, { Location: "/" });
    return res.end();
  }

  // Read the built index.html (Vercel puts it in the output)
  if (!cachedHtml) {
    try {
      cachedHtml = readFileSync(join(process.cwd(), "dist", "index.html"), "utf-8");
    } catch {
      // Fallback: try public
      try {
        cachedHtml = readFileSync(join(process.cwd(), "index.html"), "utf-8");
      } catch {
        res.writeHead(302, { Location: `/?poll=${poll}` });
        return res.end();
      }
    }
  }

  const title = escHtml(`${data.a} vs ${data.b} — ${data.label}`);
  const description = escHtml(`${data.a} or ${data.b}? Cast your vote on Taste Engine.`);
  const origin = `https://${req.headers.host}`;
  const ogImage = `${origin}/api/og?poll=${poll}`;

  const html = cachedHtml
    .replace(/<meta property="og:title"[^>]*\/?>/, `<meta property="og:title" content="${title}" />`)
    .replace(/<meta property="og:description"[^>]*\/?>/, `<meta property="og:description" content="${description}" />`)
    .replace(/<meta property="og:image"[^>]*\/?>/, `<meta property="og:image" content="${ogImage}" />`)
    .replace(/<meta name="twitter:title"[^>]*\/?>/, `<meta name="twitter:title" content="${title}" />`)
    .replace(/<meta name="twitter:description"[^>]*\/?>/, `<meta name="twitter:description" content="${description}" />`)
    .replace(/<meta name="twitter:image"[^>]*\/?>/, `<meta name="twitter:image" content="${ogImage}" />`)
    .replace(/<title>[^<]*<\/title>/, `<title>${title} | Taste Engine</title>`);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=86400, max-age=3600");
  res.status(200).send(html);
}
