
import { useMemo } from "react";
import { AggregatedDataRow, MapPoint, OkbDataRow } from "../../types";

export type SearchItem = {
  id: string;
  title: string;
  subtitle?: string;
  section: string;
  onSelect: () => void;
};

export function useSearchEverywhereItems(params: {
  activeTab: string;
  onTabChange: (tab: string) => void;

  // from app state
  uploadedData?: AggregatedDataRow[];
  okbData?: OkbDataRow[];

  // actions you already have
  onStartEdit?: (client: MapPoint) => void;
  openChannel?: (channelName: string) => void; 
}) {
  const { onTabChange, uploadedData, okbData, onStartEdit, openChannel } = params;

  return useMemo<SearchItem[]>(() => {
    const items: SearchItem[] = [];

    // --- Quick navigation ---
    items.push(
      {
        id: "nav:adapta",
        section: "Навигация",
        title: "ADAPTA",
        subtitle: "Главный экран загрузки и качества данных",
        onSelect: () => onTabChange("adapta"),
      },
      {
        id: "nav:amp",
        section: "Навигация",
        title: "AMP",
        subtitle: "Аналитика / карта / сегментации",
        onSelect: () => onTabChange("amp"),
      },
      {
        id: "nav:dashboard",
        section: "Навигация",
        title: "Дашборд План/Факт",
        subtitle: "Контроль показателей",
        onSelect: () => onTabChange("dashboard"),
      },
      {
        id: "nav:prophet",
        section: "Навигация",
        title: "PROPHET",
        subtitle: "Прогнозирование",
        onSelect: () => onTabChange("prophet"),
      },
      {
        id: "nav:agile",
        section: "Навигация",
        title: "AGILE LEARNING",
        subtitle: "A/B тесты и эксперименты",
        onSelect: () => onTabChange("agile"),
      },
      {
        id: "nav:roi",
        section: "Навигация",
        title: "ROI GENOME",
        subtitle: "Стратегия Парето",
        onSelect: () => onTabChange("roi-genome"),
      }
    );

    // --- From uploadedData: clients & channels ---
    if (uploadedData && uploadedData.length > 0) {
      const clientMap = new Map<string, MapPoint>(); // unique clients by key
      const channels = new Set<string>();

      uploadedData.forEach((row) => {
        row.clients?.forEach((c) => {
          if (c?.key) clientMap.set(c.key, c);
          const ch = c?.type || "Не определен";
          channels.add(ch);
        });
      });

      // Channels (open modal + switch to ADAPTA for context)
      Array.from(channels)
        .filter(Boolean)
        .slice(0, 200)
        .forEach((ch) => {
          items.push({
            id: `channel:${ch}`,
            section: "Каналы продаж",
            title: ch,
            subtitle: "Открыть детализацию канала",
            onSelect: () => {
              onTabChange("adapta");
              openChannel?.(ch);
            },
          });
        });

      // Clients (open editor + go to AMP or ADAPTA - choose AMP as “map/ops” context)
      // Safety cap to prevent UI lag on huge datasets
      Array.from(clientMap.values())
        .slice(0, 3000) 
        .forEach((c) => {
          const title = c.name || "Без названия";
          const sub = [
            c.rm ? `РМ: ${c.rm}` : null,
            c.city ? `Город: ${c.city}` : null,
            c.address ? c.address : null,
          ]
            .filter(Boolean)
            .join(" • ");

          items.push({
            id: `client:${c.key}`,
            section: "Клиенты",
            title: title,
            subtitle: sub,
            onSelect: () => {
              // Edit usually happens in context of map or list, switching to AMP
              onTabChange("amp");
              onStartEdit?.(c);
            },
          });
        });
    }

    // --- From OKB base: potential points (optional) ---
    if (okbData && okbData.length > 0) {
      okbData
        .filter((r) => r && r.lat && r.lon)
        .slice(0, 800) // limit for UX
        .forEach((r, i) => {
          // Robust checking for properties
          const name = r.name || r['наименование'] || r['Наименование'] || "Потенциальный клиент";
          const region = r.region || r['регион'] || r['Регион'] || "";
          const addr = r.address || r['адрес'] || r['Адрес'] || r['юридический адрес'] || "";

          items.push({
            id: `okb:${i}`,
            section: "ОКБ (Потенциал)",
            title: name,
            subtitle: [region, addr].filter(Boolean).join(" • "),
            onSelect: () => {
              onTabChange("amp");
              // Future: open potential client card, for now just switch tab
            },
          });
        });
    }

    return items;
  }, [onTabChange, uploadedData, okbData, onStartEdit, openChannel]);
}
