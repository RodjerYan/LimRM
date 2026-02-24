export interface CISPetsDistribution {
  country: string;
  catsPercent: number;
  dogsPercent: number;
  comment: string;
}

export const CIS_PETS_DISTRIBUTION: CISPetsDistribution[] = [
  {
    country: "Республика Беларусь",
    catsPercent: 58,
    dogsPercent: 42,
    comment: "Высокая доля квартир в Минске и областных центрах. Умеренный климат. «Городская» модель содержания животных"
  },
  {
    country: "Республика Казахстан",
    catsPercent: 48,
    dogsPercent: 52,
    comment: "Большая доля частных домов. Традиция сторожевых собак. В городах (Алматы, Астана) кошки преобладают, но страна в целом — более «собачья»"
  },
  {
    country: "Азербайджан",
    catsPercent: 46,
    dogsPercent: 54,
    comment: "Частный сектор. Традиция охранных собак. В Баку баланс ближе к 50/50"
  },
  {
    country: "Армения",
    catsPercent: 45,
    dogsPercent: 55,
    comment: "Горно-сельская структура. Сильная традиция пастушьих собак"
  },
  {
    country: "Кыргызская Республика",
    catsPercent: 44,
    dogsPercent: 56,
    comment: "Высокая доля частных домов. Традиция сторожевых и пастушьих собак"
  },
  {
    country: "Республика Таджикистан",
    catsPercent: 43,
    dogsPercent: 57,
    comment: ""
  },
  {
    country: "Республика Узбекистан",
    catsPercent: 47,
    dogsPercent: 53,
    comment: "Города (Ташкент) — ближе к 50/50, регионы — больше собак."
  },
  {
    country: "Республика Молдова",
    catsPercent: 49,
    dogsPercent: 51,
    comment: "Баланс почти равный; сельская структура повышает долю собак."
  }
];
