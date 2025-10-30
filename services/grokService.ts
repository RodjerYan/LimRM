// services/grokService.ts
const PROXY_URL = "/api/grok-proxy";

export interface GrokMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function callGrok(messages: GrokMessage[], model = "grok-4-latest"): Promise<string> {
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Grok API proxy error: ${res.status} — ${errText}`);
    throw new Error(`Ошибка прокси Grok: ${res.status}`);
  }

  const data = await res.json();
  return data.choices[0].message.content as string;
}
