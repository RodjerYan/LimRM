// lib/grok.ts
const API_URL = "https://api.x.ai/v1/chat/completions";

export interface GrokMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Directly calls the Grok API using a server-side API key.
 * @param messages - The array of messages for the chat completion.
 * @param model - The model to use (defaults to grok-4-latest).
 * @returns The string content of the assistant's message.
 * @throws An error if the API key is not configured or if the API call fails.
 */
export async function callGrokApi(messages: GrokMessage[], model = "grok-4-latest"): Promise<string> {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) {
    throw new Error('GROK_API_KEY is not configured on the server.');
  }
  
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      stream: false,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error(`Grok API error: ${res.status}`, data);
    throw new Error(`Grok API returned an error: ${res.status} - ${data?.error?.message || 'Unknown error'}`);
  }

  return data.choices[0].message.content as string;
}
