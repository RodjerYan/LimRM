/**
 * This service provides helper functions for interacting with the Gemini API
 * via server-side proxies.
 * 
 * Note: This file is currently not used in the application, as the more specific
 * `aiService.ts` handles the AI summary generation. It is provided as a
 * potential generic service for future expansion.
 */

/**
 * A generic function to generate content using a proxy.
 * This function assumes a generic proxy exists at `/api/gemini-proxy`.
 * 
 * @param prompt The text prompt to send to the model.
 * @param model The model to use, e.g., 'gemini-2.5-flash'.
 * @returns The generated text content from the model.
 */
export async function generateContentViaProxy(prompt: string, model: string = 'gemini-2.5-flash'): Promise<string> {
    try {
        const response = await fetch('/api/gemini-proxy', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: model,
                contents: prompt,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Request failed with status ${response.status}`);
        }

        const result = await response.json();
        return result.text ?? '';
    } catch (error) {
        console.error("Error in generateContentViaProxy:", error);
        throw error;
    }
}

/**
 * A simple ping function to check if the Gemini proxy is alive.
 */
export async function pingGeminiProxy(): Promise<boolean> {
    try {
        const response = await fetch('/api/gemini-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'ping', contents: 'ping' }),
        });
        // We expect a 400 because the model is invalid, but it means the server is running.
        return response.status === 400;
    } catch (error) {
        return false;
    }
}
