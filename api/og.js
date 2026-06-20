/**
 * Vercel Serverless Function — Dynamic OG image for poll links.
 * Returns a 1200x630 PNG with poll-specific names.
 * URL: /api/og?poll=poll-jordan-lebron
 */
import { ImageResponse } from "@vercel/og";

export const config = { runtime: "edge" };

const POLLS = {
  "poll-jordan-lebron": { a: "Michael Jordan", b: "LeBron James", label: "The GOAT debate", cat: "SPORTS" },
  "poll-messi-ronaldo": { a: "Lionel Messi", b: "Cristiano Ronaldo", label: "Football's eternal rivalry", cat: "SPORTS" },
  "poll-brady-montana": { a: "Tom Brady", b: "Joe Montana", label: "NFL quarterback GOAT", cat: "SPORTS" },
  "poll-pizza-nuggets": { a: "Pizza", b: "Chicken Nuggets", label: "Ultimate comfort food", cat: "FOOD" },
  "poll-sushi-tacos": { a: "Sushi", b: "Tacos", label: "Best handheld meal", cat: "FOOD" },
  "poll-chocolate-icecream": { a: "Chocolate", b: "Ice Cream", label: "Sweet tooth showdown", cat: "FOOD" },
  "poll-coffee-tea": { a: "Coffee", b: "Tea", label: "Morning ritual", cat: "FOOD" },
  "poll-iphone-android": { a: "iPhone", b: "Android", label: "The phone war", cat: "TECH" },
  "poll-playstation-xbox": { a: "PlayStation", b: "Xbox", label: "Console wars", cat: "TECH" },
  "poll-windows-mac": { a: "Windows", b: "macOS", label: "Desktop OS battle", cat: "TECH" },
  "poll-einstein-newton": { a: "Albert Einstein", b: "Isaac Newton", label: "Greatest scientist ever", cat: "CULTURE" },
  "poll-batman-superman": { a: "Batman", b: "Superman", label: "Who wins in a fight?", cat: "CULTURE" },
  "poll-marvel-dc": { a: "Marvel", b: "DC", label: "Comic universe showdown", cat: "CULTURE" },
  "poll-swift-beyonce": { a: "Taylor Swift", b: "Beyoncé", label: "Pop queen crown", cat: "CULTURE" },
  "poll-dog-cat": { a: "Dog", b: "Cat", label: "The eternal pet debate", cat: "ANIMALS" },
  "poll-shark-lion": { a: "Great White Shark", b: "Lion", label: "Apex predator face-off", cat: "ANIMALS" },
  "poll-eagle-wolf": { a: "Bald Eagle", b: "Wolf", label: "Spirit animal pick", cat: "ANIMALS" },
  "poll-honda-toyota": { a: "Honda", b: "Toyota", label: "Reliability king", cat: "CARS" },
  "poll-lambo-ferrari": { a: "Lamborghini", b: "Ferrari", label: "Dream car duel", cat: "CARS" },
  "poll-tesla-porsche": { a: "Tesla", b: "Porsche", label: "Future vs heritage", cat: "CARS" },
};

export default function handler(req) {
  const { searchParams } = new URL(req.url);
  const pollId = searchParams.get("poll");
  const data = pollId ? POLLS[pollId] : null;

  const nameA = data?.a || "Pizza";
  const nameB = data?.b || "Sushi";
  const label = data?.label || "Which do you prefer?";
  const cat = data?.cat || "";

  const fontA = nameA.length > 14 ? 28 : 36;
  const fontB = nameB.length > 14 ? 28 : 36;

  // Using the html tagged template approach for @vercel/og without JSX
  return new ImageResponse(
    {
      type: "div",
      props: {
        style: {
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1A1713, #0D0B09)",
          fontFamily: "system-ui, sans-serif",
        },
        children: [
          // Title
          {
            type: "div",
            props: {
              style: { fontSize: 54, fontWeight: 800, color: "#F4F2EC", letterSpacing: -1, marginBottom: 4 },
              children: "TASTE ENGINE",
            },
          },
          // Label
          {
            type: "div",
            props: {
              style: { fontSize: 18, fontWeight: 600, color: "#FF3B1F", letterSpacing: 4, textTransform: "uppercase", marginBottom: 36 },
              children: label,
            },
          },
          // Cards row
          {
            type: "div",
            props: {
              style: { display: "flex", alignItems: "center", gap: 32 },
              children: [
                // Left card
                {
                  type: "div",
                  props: {
                    style: {
                      width: 380, height: 300, background: "#232019", borderRadius: 22,
                      border: "1.5px solid #3A362E", display: "flex", alignItems: "center", justifyContent: "center",
                    },
                    children: {
                      type: "div",
                      props: {
                        style: { fontSize: fontA, fontWeight: 700, color: "#F4F2EC", textAlign: "center", padding: "0 20px" },
                        children: nameA,
                      },
                    },
                  },
                },
                // VS badge
                {
                  type: "div",
                  props: {
                    style: {
                      width: 90, height: 90, borderRadius: 45, background: "#FF3B1F",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 38, fontWeight: 800, color: "#fff", flexShrink: 0,
                    },
                    children: "VS",
                  },
                },
                // Right card
                {
                  type: "div",
                  props: {
                    style: {
                      width: 380, height: 300, background: "#232019", borderRadius: 22,
                      border: "1.5px solid #3A362E", display: "flex", alignItems: "center", justifyContent: "center",
                    },
                    children: {
                      type: "div",
                      props: {
                        style: { fontSize: fontB, fontWeight: 700, color: "#F4F2EC", textAlign: "center", padding: "0 20px" },
                        children: nameB,
                      },
                    },
                  },
                },
              ],
            },
          },
          // Bottom row
          {
            type: "div",
            props: {
              style: { display: "flex", alignItems: "center", gap: 16, marginTop: 28 },
              children: [
                cat ? {
                  type: "div",
                  props: {
                    style: { fontSize: 13, fontWeight: 600, color: "#FF3B1F", letterSpacing: 2, background: "#2A261F", padding: "6px 16px", borderRadius: 99 },
                    children: cat,
                  },
                } : null,
                {
                  type: "div",
                  props: {
                    style: { fontSize: 14, color: "rgba(255,255,255,0.3)", letterSpacing: 3 },
                    children: "CAST YOUR VOTE",
                  },
                },
              ].filter(Boolean),
            },
          },
        ],
      },
    },
    { width: 1200, height: 630 }
  );
}
