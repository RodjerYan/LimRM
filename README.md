<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1sqg1n4UwsVFQQNWxFPeyy9LE3-2AT1HZ

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Vercel Deployment Note

To conform to Vercel's Hobby Plan limits (max 12 serverless functions), this project includes an automated script (`scripts/vercel-cleanup.js`) that runs before `vite build`.

This script deletes redundant individual API files (e.g., `api/get-okb.ts`, `api/auth/login.ts`) because their logic has been consolidated into:
- `api/data-ops.ts`
- `api/auth-ops.ts`
- `api/cache-ops.ts`
- `api/gemini-proxy.ts`

This ensures only ~4 functions are deployed instead of 19+.
