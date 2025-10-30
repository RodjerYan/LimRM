// services/addressAnalyzer.ts
import { callGrok } from './grokService';
import { parseRussianAddress } from './addressParser';

export async function analyzeAddresses(rawAddresses: string[]) {
  const parsed = rawAddresses.map(addr => {
    const p = parseRussianAddress(addr);
    // Return a consistent format, even if parsing fails
    const region = p.region !== 'Регион не определён' ? p.region : 'Неизвестный регион';
    const city = p.city !== 'Город не определён' && p.city !== region ? p.city : 'Неизвестный город';
    return `${region} | ${city} | ${addr}`;
  });

  const prompt = `
Ты — аналитик данных для компании зоотоваров, работающей в новых регионах РФ и СНГ.
Тебе предоставлен список адресов в формате: "Регион | Город | Полный адрес".

Твоя задача — провести анализ и вернуть результат **ТОЛЬКО в формате JSON** со следующей структурой:
{
  "regional_summary": {
    "description": "Краткий обзор географии поставок.",
    "regions": [
      { "region": "Название региона", "count": 15, "cities": ["Город1", "Город2"] }
    ]
  },
  "top_cities": [
    { "city": "Название города", "count": 10 },
    { "city": "Название города", "count": 8 }
  ],
  "duplicate_analysis": {
    "description": "Анализ потенциальных дубликатов или связанных адресов.",
    "potential_duplicates": []
  },
  "recommendations": {
    "warehouse_location": "Рекомендация по оптимальному городу для склада с обоснованием.",
    "logistics_improvements": "Предложения по улучшению логистики."
  }
}

Проанализируй следующие данные:
\`\`\`
${parsed.slice(0, 250).join('\n')}
\`\`\`

Верни **ТОЛЬКО JSON** и ничего больше.
`.trim();

  const result = await callGrok([
    { role: "system", content: "You are a data analyst that returns only JSON." },
    { role: "user", content: prompt }
  ]);

  try {
    // Grok might wrap the JSON in markdown, so we clean it up.
    const cleanedResult = result.replace(/^```json\n|```$/g, '').trim();
    return JSON.parse(cleanedResult);
  } catch (e) {
    console.error("Failed to parse Grok's JSON response:", e);
    console.error("Raw response from Grok:", result);
    // Return the raw string if parsing fails, for debugging.
    return { error: "Не удалось обработать ответ от Grok в формате JSON.", raw_response: result };
  }
}
