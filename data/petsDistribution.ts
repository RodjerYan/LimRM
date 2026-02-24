export interface RegionPetsDistribution {
  region: string;
  catsPercent: number;
  dogsPercent: number;
}

export const PETS_DISTRIBUTION: RegionPetsDistribution[] = [
  // ЦЕНТРАЛЬНЫЙ ФО
  { region: "Москва", catsPercent: 62, dogsPercent: 38 },
  { region: "Московская область", catsPercent: 58, dogsPercent: 42 },
  { region: "Белгородская область", catsPercent: 52, dogsPercent: 48 },
  { region: "Брянская область", catsPercent: 53, dogsPercent: 47 },
  { region: "Владимирская область", catsPercent: 54, dogsPercent: 46 },
  { region: "Воронежская область", catsPercent: 53, dogsPercent: 47 },
  { region: "Ивановская область", catsPercent: 55, dogsPercent: 45 },
  { region: "Калужская область", catsPercent: 56, dogsPercent: 44 },
  { region: "Костромская область", catsPercent: 54, dogsPercent: 46 },
  { region: "Курская область", catsPercent: 52, dogsPercent: 48 },
  { region: "Липецкая область", catsPercent: 53, dogsPercent: 47 },
  { region: "Орловская область", catsPercent: 53, dogsPercent: 47 },
  { region: "Рязанская область", catsPercent: 54, dogsPercent: 46 },
  { region: "Смоленская область", catsPercent: 54, dogsPercent: 46 },
  { region: "Тамбовская область", catsPercent: 52, dogsPercent: 48 },
  { region: "Тверская область", catsPercent: 55, dogsPercent: 45 },
  { region: "Тульская область", catsPercent: 54, dogsPercent: 46 },
  { region: "Ярославская область", catsPercent: 56, dogsPercent: 44 },

  // СЕВЕРО-ЗАПАДНЫЙ ФО
  { region: "Санкт-Петербург", catsPercent: 64, dogsPercent: 36 },
  { region: "Ленинградская область", catsPercent: 57, dogsPercent: 43 },
  { region: "Калининградская область", catsPercent: 56, dogsPercent: 44 },
  { region: "Республика Карелия", catsPercent: 55, dogsPercent: 45 },
  { region: "Республика Коми", catsPercent: 53, dogsPercent: 47 },
  { region: "Архангельская область", catsPercent: 54, dogsPercent: 46 },
  { region: "Вологодская область", catsPercent: 55, dogsPercent: 45 },
  { region: "Мурманская область", catsPercent: 58, dogsPercent: 42 },
  { region: "Новгородская область", catsPercent: 55, dogsPercent: 45 },
  { region: "Псковская область", catsPercent: 54, dogsPercent: 46 },

  // ЮЖНЫЙ ФО
  { region: "Краснодарский край", catsPercent: 48, dogsPercent: 52 },
  { region: "Ростовская область", catsPercent: 49, dogsPercent: 51 },
  { region: "Волгоградская область", catsPercent: 51, dogsPercent: 49 },
  { region: "Астраханская область", catsPercent: 50, dogsPercent: 50 },
  { region: "Республика Адыгея", catsPercent: 47, dogsPercent: 53 },
  { region: "Республика Калмыкия", catsPercent: 46, dogsPercent: 54 },
  { region: "Республика Крым", catsPercent: 50, dogsPercent: 50 },
  { region: "Севастополь", catsPercent: 52, dogsPercent: 48 },

  // СЕВЕРО-КАВКАЗСКИЙ ФО
  { region: "Ставропольский край", catsPercent: 48, dogsPercent: 52 },
  { region: "Республика Дагестан", catsPercent: 44, dogsPercent: 56 },
  { region: "Чеченская Республика", catsPercent: 43, dogsPercent: 57 },
  { region: "Республика Ингушетия", catsPercent: 44, dogsPercent: 56 },
  { region: "Кабардино-Балкарская Республика", catsPercent: 46, dogsPercent: 54 },
  { region: "Карачаево-Черкесская Республика", catsPercent: 46, dogsPercent: 54 },
  { region: "Республика Северная Осетия — Алания", catsPercent: 47, dogsPercent: 53 },

  // ПРИВОЛЖСКИЙ ФО
  { region: "Республика Татарстан", catsPercent: 53, dogsPercent: 47 },
  { region: "Республика Башкортостан", catsPercent: 51, dogsPercent: 49 }, // Note: User wrote "Башкортостан", usually "Республика Башкортостан" in map data
  { region: "Самарская область", catsPercent: 54, dogsPercent: 46 },
  { region: "Саратовская область", catsPercent: 52, dogsPercent: 48 },
  { region: "Нижегородская область", catsPercent: 55, dogsPercent: 45 },
  { region: "Пермский край", catsPercent: 53, dogsPercent: 47 },
  { region: "Оренбургская область", catsPercent: 50, dogsPercent: 50 },
  { region: "Пензенская область", catsPercent: 52, dogsPercent: 48 },
  { region: "Ульяновская область", catsPercent: 53, dogsPercent: 47 },
  { region: "Кировская область", catsPercent: 54, dogsPercent: 46 },
  { region: "Республика Марий Эл", catsPercent: 52, dogsPercent: 48 },
  { region: "Республика Мордовия", catsPercent: 51, dogsPercent: 49 },
  { region: "Удмуртская Республика", catsPercent: 52, dogsPercent: 48 },
  { region: "Чувашская Республика", catsPercent: 52, dogsPercent: 48 },

  // УРАЛЬСКИЙ ФО
  { region: "Свердловская область", catsPercent: 55, dogsPercent: 45 },
  { region: "Челябинская область", catsPercent: 54, dogsPercent: 46 },
  { region: "Тюменская область", catsPercent: 52, dogsPercent: 48 },
  { region: "Курганская область", catsPercent: 51, dogsPercent: 49 },
  { region: "Ханты-Мансийский автономный округ — Югра", catsPercent: 53, dogsPercent: 47 },
  { region: "Ямало-Ненецкий автономный округ", catsPercent: 52, dogsPercent: 48 },

  // СИБИРСКИЙ ФО
  { region: "Новосибирская область", catsPercent: 55, dogsPercent: 45 },
  { region: "Красноярский край", catsPercent: 54, dogsPercent: 46 },
  { region: "Иркутская область", catsPercent: 53, dogsPercent: 47 },
  { region: "Кемеровская область", catsPercent: 52, dogsPercent: 48 },
  { region: "Омская область", catsPercent: 53, dogsPercent: 47 },
  { region: "Томская область", catsPercent: 56, dogsPercent: 44 },
  { region: "Алтайский край", catsPercent: 50, dogsPercent: 50 },
  { region: "Республика Алтай", catsPercent: 48, dogsPercent: 52 },
  { region: "Республика Тыва", catsPercent: 47, dogsPercent: 53 },
  { region: "Республика Хакасия", catsPercent: 51, dogsPercent: 49 },

  // ДАЛЬНЕВОСТОЧНЫЙ ФО
  { region: "Приморский край", catsPercent: 55, dogsPercent: 45 },
  { region: "Хабаровский край", catsPercent: 54, dogsPercent: 46 },
  { region: "Амурская область", catsPercent: 52, dogsPercent: 48 },
  { region: "Сахалинская область", catsPercent: 56, dogsPercent: 44 },
  { region: "Камчатский край", catsPercent: 54, dogsPercent: 46 },
  { region: "Магаданская область", catsPercent: 53, dogsPercent: 47 },
  { region: "Республика Саха (Якутия)", catsPercent: 51, dogsPercent: 49 },
  { region: "Еврейская автономная область", catsPercent: 52, dogsPercent: 48 },
  { region: "Чукотский автономный округ", catsPercent: 50, dogsPercent: 50 },
  { region: "Забайкальский край", catsPercent: 52, dogsPercent: 48 },
  { region: "Республика Бурятия", catsPercent: 51, dogsPercent: 49 }
];
