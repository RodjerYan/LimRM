import type { Config } from "@netlify/functions";

export default async (req: Request) => {
    // This log helps confirm the cron job is running in the Netlify Function logs
    console.log("[Keep-Alive] Trigger executed at " + new Date().toISOString());

    // Optional: Ping a lightweight endpoint within your own app to ensure the main runtime container is warm
    // We use the deployment URL provided by Netlify environment variables
    const baseUrl = process.env.URL || 'http://localhost:8888';
    
    try {
        // Calling a fast endpoint (like the version check) to wake up the function/container
        // Use a background fetch so we don't wait for it if not needed, but here we wait to ensure execution
        const response = await fetch(`${baseUrl}/api/check-rosstat-update`);
        if (response.ok) {
            console.log("[Keep-Alive] Self-ping successful");
        } else {
            console.warn("[Keep-Alive] Self-ping returned status:", response.status);
        }
    } catch (e) {
        console.error("[Keep-Alive] Self-ping failed:", e);
    }

    return new Response("Alive");
};

// Cron schedule: "* * * * *" runs every minute
export const config: Config = {
    schedule: "* * * * *"
};