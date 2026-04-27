import type { NextConfig } from "next";
import path from "path";
import { readFileSync } from "fs";

// ── Build-time version stamp ───────────────────────────────────────────────────
// Surfaces in Settings so the user can confirm they're running the latest
// build (Safari home-screen webapps are notorious for serving stale shells).
//
// Sources, in priority order — first one set wins:
//   VERCEL_GIT_COMMIT_SHA       (Vercel)
//   CF_PAGES_COMMIT_SHA         (Cloudflare Pages)
//   COMMIT_REF                  (Netlify)
//   GITHUB_SHA                  (GitHub Actions)
//   GIT_COMMIT_SHA              (manual override)
const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "package.json"), "utf8"),
) as { version: string };

const fullSha =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.COMMIT_REF ||
  process.env.GITHUB_SHA ||
  process.env.GIT_COMMIT_SHA ||
  "";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_SHA:   fullSha.slice(0, 7) || "dev",
    NEXT_PUBLIC_BUILD_TIME:  new Date().toISOString(),
  },
};

export default nextConfig;
