export interface Capital {
    name: string;
    lat: number;
    lon: number;
    type: 'country' | 'capital';
    region_name?: string; // Add optional region name for better mapping
}

export const capitals: Capital[] = [
    // === Страны ===
    { name: 'Москва', lat: 55.7558, lon: 37.6176, type: 'country', region_name: 'Москва' },
    { name: 'Минск', lat: 53.9045, lon: 27.5615, type: 'country', region_name: 'Республика Беларусь' },
    { name: 'Астана', lat: 51.1694, lon: 71.4491, type: 'country', region_name: 'Республика Казахстан' },
    { name: 'Бишкек', lat: 42.8746, lon: 74.5698, type: 'country', region_name: 'Кыргызская Республика' },
    { name: 'Сухум', lat: 43.0013, lon: 41.0234, type: 'country', region_name: 'Республика Абхазия' },
    { name: 'Ереван', lat: 40.1792, lon: 44.4991, type: 'country', region_name: 'Армения' },
    { name: 'Баку', lat: 40.4093, lon: 49.8671, type: 'country', region_name: 'Азербайджан' },
    { name: 'Кишинёв', lat: 47.0105, lon: 28.8638, type: 'country', region_name: 'Молдова' },
    { name: 'Душанбе', lat: 38.5598, lon: 68.7870, type: 'country', region_name: 'Таджикистан' },
    { name: 'Ташкент', lat: 41.2995, lon: 69.2401, type: 'country', region_name: 'Узбекистан' },
    { name: 'Ашхабад', lat: 37.9601, lon: 58.3261, type: 'country', region_name: 'Туркменистан' },

    // === Регионы РФ ===
    // ЦФО
    { name: 'Санкт-Петербург', lat: 59.9343, lon: 30.3351, type: 'capital', region_name: 'Санкт-Петербург' },
    { name: 'Белгород', lat: 50.6000, lon: 36.6000, type: 'capital', region_name: 'Белгородская область' },
    { name: 'Брянск', lat: 53.2521, lon: 34.3717, type: 'capital', region_name: 'Брянская область' },
    { name: 'Владимир', lat: 56.1290, lon: 40.4058, type: 'capital', region_name: 'Владимирская область' },
    { name: 'Воронеж', lat: 51.6606, lon: 39.2003, type: 'capital', region_name: 'Воронежская область' },
    { name: 'Иваново', lat: 57.0003, lon: 40.9739, type: 'capital', region_name: 'Ивановская область' },
    { name: 'Калуга', lat: 54.5137, lon: 36.2613, type: 'capital', region_name: 'Калужская область' },
    { name: 'Кострома', lat: 57.7679, lon: 40.9269, type: 'capital', region_name: 'Костромская область' },
    { name: 'Курск', lat: 51.7373, lon: 36.1872, type: 'capital', region_name: 'Курская область' },
    { name: 'Липецк', lat: 52.6074, lon: 39.5986, type: 'capital', region_name: 'Липецкая область' },
    { name: 'Орёл', lat: 52.9694, lon: 36.0694, type: 'capital', region_name: 'Орловская область' },
    { name: 'Рязань', lat: 54.6269, lon: 39.7417, type: 'capital', region_name: 'Рязанская область' },
    { name: 'Смоленск', lat: 54.7826, lon: 32.0453, type: 'capital', region_name: 'Смоленская область' },
    { name: 'Тамбов', lat: 52.7211, lon: 41.4542, type: 'capital', region_name: 'Тамбовская область' },
    { name: 'Тверь', lat: 56.8584, lon: 35.9118, type: 'capital', region_name: 'Тверская область' },
    { name: 'Тула', lat: 54.1961, lon: 37.6182, type: 'capital', region_name: 'Тульская область' },
    { name: 'Ярославль', lat: 57.6265, lon: 39.8938, type: 'capital', region_name: 'Ярославская область' },
    // СЗФО
    { name: 'Архангельск', lat: 64.5393, lon: 40.5187, type: 'capital', region_name: 'Архангельская область' },
    { name: 'Вологда', lat: 59.2205, lon: 39.8915, type: 'capital', region_name: 'Вологодская область' },
    { name: 'Калининград', lat: 54.7101, lon: 20.5101, type: 'capital', region_name: 'Калининградская область' },
    { name: 'Мурманск', lat: 68.9707, lon: 33.0747, type: 'capital', region_name: 'Мурманская область' },
    { name: 'Великий Новгород', lat: 58.5212, lon: 31.2758, type: 'capital', region_name: 'Новгородская область' },
    { name: 'Псков', lat: 57.8136, lon: 28.3325, type: 'capital', region_name: 'Псковская область' },
    { name: 'Петрозаводск', lat: 61.7849, lon: 34.3512, type: 'capital', region_name: 'Республика Карелия' },
    { name: 'Сыктывкар', lat: 61.6684, lon: 50.8354, type: 'capital', region_name: 'Республика Коми' },
    // ЮФО
    { name: 'Майкоп', lat: 44.6094, lon: 40.1057, type: 'capital', region_name: 'Республика Адыгея' },
    { name: 'Элиста', lat: 46.3072, lon: 44.2681, type: 'capital', region_name: 'Республика Калмыкия' },
    { name: 'Симферополь', lat: 44.9484, lon: 34.1024, type: 'capital', region_name: 'Республика Крым' },
    { name: 'Севастополь', lat: 44.6166, lon: 33.5254, type: 'capital', region_name: 'Севастополь' },
    { name: 'Краснодар', lat: 45.0355, lon: 38.9753, type: 'capital', region_name: 'Краснодарский край' },
    { name: 'Астрахань', lat: 46.3497, lon: 48.0302, type: 'capital', region_name: 'Астраханская область' },
    { name: 'Волгоград', lat: 48.7080, lon: 44.5133, type: 'capital', region_name: 'Волгоградская область' },
    { name: 'Ростов-на-Дону', lat: 47.2333, lon: 39.7000, type: 'capital', region_name: 'Ростовская область' },
    // СКФО
    { name: 'Махачкала', lat: 42.9831, lon: 47.5047, type: 'capital', region_name: 'Республика Дагестан' },
    { name: 'Магас', lat: 43.1667, lon: 44.8167, type: 'capital', region_name: 'Республика Ингушетия' },
    { name: 'Нальчик', lat: 43.4833, lon: 43.6167, type: 'capital', region_name: 'Кабардино-Балкарская Республика' },
    { name: 'Черкесск', lat: 44.2236, lon: 42.0522, type: 'capital', region_name: 'Карачаево-Черкесская Республика' },
    { name: 'Владикавказ', lat: 43.0361, lon: 44.6675, type: 'capital', region_name: 'Республика Северная Осетия — Алания' },
    { name: 'Грозный', lat: 43.3167, lon: 45.7000, type: 'capital', region_name: 'Чеченская Республика' },
    { name: 'Ставрополь', lat: 45.0428, lon: 41.9734, type: 'capital', region_name: 'Ставропольский край' },
    // ПФО
    { name: 'Нижний Новгород', lat: 56.3269, lon: 44.0059, type: 'capital', region_name: 'Нижегородская область' },
    { name: 'Казань', lat: 55.7961, lon: 49.1064, type: 'capital', region_name: 'Республика Татарстан' },
    { name: 'Самара', lat: 53.1959, lon: 50.1002, type: 'capital', region_name: 'Самарская область' },
    { name: 'Уфа', lat: 54.7351, lon: 55.9583, type: 'capital', region_name: 'Республика Башкортостан' },
    { name: 'Пермь', lat: 58.0105, lon: 56.2502, type: 'capital', region_name: 'Пермский край' },
    { name: 'Саратов', lat: 51.5335, lon: 46.0343, type: 'capital', region_name: 'Саратовская область' },
    { name: 'Ижевск', lat: 56.8497, lon: 53.2045, type: 'capital', region_name: 'Удмуртская Республика' },
    { name: 'Ульяновск', lat: 54.3142, lon: 48.4036, type: 'capital', region_name: 'Ульяновская область' },
    { name: 'Оренбург', lat: 51.7682, lon: 55.0969, type: 'capital', region_name: 'Оренбургская область' },
    { name: 'Пенза', lat: 53.1959, lon: 45.0189, type: 'capital', region_name: 'Пензенская область' },
    { name: 'Киров', lat: 58.6036, lon: 49.6680, type: 'capital', region_name: 'Кировская область' },
    { name: 'Чебоксары', lat: 56.1322, lon: 47.2519, type: 'capital', region_name: 'Чувашская Республика' },
    { name: 'Саранск', lat: 54.1873, lon: 45.1834, type: 'capital', region_name: 'Республика Мордовия' },
    { name: 'Йошкар-Ола', lat: 56.6333, lon: 47.8833, type: 'capital', region_name: 'Республика Марий Эл' },
    // УФО
    { name: 'Екатеринбург', lat: 56.8389, lon: 60.6057, type: 'capital', region_name: 'Свердловская область' },
    { name: 'Челябинск', lat: 55.1644, lon: 61.4026, type: 'capital', region_name: 'Челябинская область' },
    { name: 'Тюмень', lat: 57.1533, lon: 65.5343, type: 'capital', region_name: 'Тюменская область' },
    { name: 'Ханты-Мансийск', lat: 61.0042, lon: 69.0019, type: 'capital', region_name: 'Ханты-Мансийский автономный округ — Югра' },
    { name: 'Курган', lat: 55.4500, lon: 65.3333, type: 'capital', region_name: 'Курганская область' },
    // СФО
    { name: 'Новосибирск', lat: 55.0301, lon: 82.9204, type: 'capital', region_name: 'Новосибирская область' },
    { name: 'Омск', lat: 54.9894, lon: 73.3686, type: 'capital', region_name: 'Омская область' },
    { name: 'Красноярск', lat: 56.0105, lon: 92.8525, type: 'capital', region_name: 'Красноярский край' },
    { name: 'Барнаул', lat: 53.3467, lon: 83.7768, type: 'capital', region_name: 'Алтайский край' },
    { name: 'Иркутск', lat: 52.2869, lon: 104.3050, type: 'capital', region_name: 'Иркутская область' },
    { name: 'Кемерово', lat: 55.3550, lon: 86.0883, type: 'capital', region_name: 'Кемеровская область' },
    { name: 'Улан-Удэ', lat: 51.8336, lon: 107.5844, type: 'capital', region_name: 'Республика Бурятия' },
    { name: 'Томск', lat: 56.4846, lon: 84.9479, type: 'capital', region_name: 'Томская область' },
    { name: 'Абакан', lat: 53.7167, lon: 91.4167, type: 'capital', region_name: 'Республика Хакасия' },
    // ДФО
    { name: 'Владивосток', lat: 43.1167, lon: 131.8833, type: 'capital', region_name: 'Приморский край' },
    { name: 'Хабаровск', lat: 48.4827, lon: 135.0838, type: 'capital', region_name: 'Хабаровский край' },
    { name: 'Чита', lat: 52.0333, lon: 113.5000, type: 'capital', region_name: 'Забайкальский край' },
    { name: 'Якутск', lat: 62.0339, lon: 129.7331, type: 'capital', region_name: 'Республика Саха (Якутия)' },
    { name: 'Благовещенск', lat: 50.2500, lon: 127.5333, type: 'capital', region_name: 'Амурская область' },
    { name: 'Южно-Сахалинск', lat: 46.9500, lon: 142.7333, type: 'capital', region_name: 'Сахалинская область' },
    { name: 'Петропавловск-Камчатский', lat: 53.0167, lon: 158.6500, type: 'capital', region_name: 'Камчатский край' },
    { name: 'Магадан', lat: 59.5667, lon: 150.8000, type: 'capital', region_name: 'Магаданская область' },
    { name: 'Биробиджан', lat: 48.7833, lon: 132.9500, type: 'capital', region_name: 'Еврейская автономная область' },
    { name: 'Анадырь', lat: 64.7333, lon: 177.5167, type: 'capital', region_name: 'Чукотский автономный округ' },
    // Новые территории
    { name: 'Луганск', lat: 48.5740, lon: 39.3082, type: 'capital', region_name: 'Луганская Народная Республика' },
    { name: 'Донецк', lat: 48.0159, lon: 37.8028, type: 'capital', region_name: 'Донецкая Народная Республика' },
    { name: 'Мелитополь', lat: 46.8491, lon: 35.3673, type: 'capital', region_name: 'Запорожская область' },
    { name: 'Геническ', lat: 46.1742, lon: 34.8086, type: 'capital', region_name: 'Херсонская область' },

    // === Крупные административные центры РФ ===
    { name: 'Норильск', lat: 69.3498, lon: 88.2023, type: 'capital', region_name: 'Красноярский край' },
    { name: 'Сочи', lat: 43.5855, lon: 39.7233, type: 'capital', region_name: 'Краснодарский край' },
    { name: 'Новороссийск', lat: 44.7241, lon: 37.7675, type: 'capital', region_name: 'Краснодарский край' },
    { name: 'Таганрог', lat: 47.2167, lon: 38.9333, type: 'capital', region_name: 'Ростовская область' },
    { name: 'Магнитогорск', lat: 53.4186, lon: 59.0472, type: 'capital', region_name: 'Челябинская область' },
    { name: 'Нижний Тагил', lat: 57.9167, lon: 59.9667, type: 'capital', region_name: 'Свердловская область' },
    { name: 'Стерлитамак', lat: 53.6333, lon: 55.9500, type: 'capital', region_name: 'Республика Башкортостан' },
    { name: 'Дзержинск', lat: 56.2367, lon: 43.4611, type: 'capital', region_name: 'Нижегородская область' },
    { name: 'Шахты', lat: 47.7167, lon: 40.2167, type: 'capital', region_name: 'Ростовская область' },
    { name: 'Сургут', lat: 61.25, lon: 73.4167, type: 'capital', region_name: 'Ханты-Мансийский автономный округ — Югра' },
    { name: 'Ангарск', lat: 52.5167, lon: 103.9167, type: 'capital', region_name: 'Иркутская область' },
    { name: 'Братск', lat: 56.1667, lon: 101.6167, type: 'capital', region_name: 'Иркутская область' },
    { name: 'Орск', lat: 51.2167, lon: 58.5667, type: 'capital', region_name: 'Оренбургская область' },
    { name: 'Прокопьевск', lat: 53.9, lon: 86.7167, type: 'capital', region_name: 'Кемеровская область' },
    { name: 'Златоуст', lat: 55.1667, lon: 59.6667, type: 'capital', region_name: 'Челябинская область' },
    { name: 'Миасс', lat: 55.05, lon: 60.1, type: 'capital', region_name: 'Челябинская область' },
    { name: 'Каменск-Уральский', lat: 56.4167, lon: 61.9333, type: 'capital', region_name: 'Свердловская область' },
    { name: 'Бийск', lat: 52.5167, lon: 85.1667, type: 'capital', region_name: 'Алтайский край' },
    { name: 'Сызрань', lat: 53.15, lon: 48.4667, type: 'capital', region_name: 'Самарская область' },
    { name: 'Березники', lat: 59.4, lon: 56.7833, type: 'capital', region_name: 'Пермский край' },
    { name: 'Салават', lat: 53.3667, lon: 55.9333, type: 'capital', region_name: 'Республика Башкортостан' },
    { name: 'Копейск', lat: 55.1, lon: 61.6167, type: 'capital', region_name: 'Челябинская область' },
    { name: 'Первоуральск', lat: 56.9167, lon: 59.95, type: 'capital', region_name: 'Свердловская область' },

    // === Регионы СНГ ===
    // Беларусь
    { name: 'Гомель', lat: 52.4242, lon: 31.0084, type: 'capital', region_name: 'Гомельская область' },
    { name: 'Могилёв', lat: 53.9100, lon: 30.3400, type: 'capital', region_name: 'Могилёвская область' },
    { name: 'Витебск', lat: 55.1904, lon: 30.2049, type: 'capital', region_name: 'Витебская область' },
    { name: 'Гродно', lat: 53.6884, lon: 23.8258, type: 'capital', region_name: 'Гродненская область' },
    { name: 'Брест', lat: 52.0976, lon: 23.7341, type: 'capital', region_name: 'Брестская область' },
    // Казахстан
    { name: 'Алматы', lat: 43.2220, lon: 76.8512, type: 'capital', region_name: 'Алматы' },
    { name: 'Шымкент', lat: 42.3167, lon: 69.6000, type: 'capital', region_name: 'Шымкент' },
    { name: 'Караганда', lat: 49.8333, lon: 73.1167, type: 'capital', region_name: 'Карагандинская область' },
    { name: 'Актобе', lat: 50.2833, lon: 57.1667, type: 'capital', region_name: 'Актюбинская область' },
    { name: 'Тараз', lat: 42.9000, lon: 71.3667, type: 'capital', region_name: 'Жамбылская область' },
    { name: 'Павлодар', lat: 52.3000, lon: 76.9500, type: 'capital', region_name: 'Павлодарская область' },
    { name: 'Усть-Каменогорск', lat: 49.9833, lon: 82.6167, type: 'capital', region_name: 'Восточно-Казахстанская область' },
    { name: 'Семей', lat: 50.4167, lon: 80.2500, type: 'capital', region_name: 'Абайская область' },
    { name: 'Уральск', lat: 51.2333, lon: 51.3667, type: 'capital', region_name: 'Западно-Казахстанская область' },
    { name: 'Актау', lat: 43.6500, lon: 51.1667, type: 'capital', region_name: 'Мангистауская область' },
    // Кыргызстан
    { name: 'Ош', lat: 40.5167, lon: 72.8000, type: 'capital', region_name: 'Ошская область' },
    // Абхазия
    { name: 'Гагра', lat: 43.2800, lon: 40.2600, type: 'capital', region_name: 'Гагрский район' },
    // Армения
    { name: 'Гюмри', lat: 40.7895, lon: 43.8449, type: 'capital', region_name: 'Ширакская область' },
    { name: 'Ванадзор', lat: 40.8122, lon: 44.4912, type: 'capital', region_name: 'Лорийская область' },
    // Азербайджан
    { name: 'Гянджа', lat: 40.6828, lon: 46.3606, type: 'capital', region_name: 'Гянджа' },
    { name: 'Сумгаит', lat: 40.5917, lon: 49.6686, type: 'capital', region_name: 'Сумгаит' },
    // Молдова
    { name: 'Тирасполь', lat: 46.8403, lon: 29.6133, type: 'capital', region_name: 'Приднестровье' },
    { name: 'Бельцы', lat: 47.7618, lon: 27.9252, type: 'capital', region_name: 'Муниципий Бельцы' },
    // Таджикистан
    { name: 'Худжанд', lat: 40.2858, lon: 69.6231, type: 'capital', region_name: 'Согдийская область' },
    { name: 'Куляб', lat: 37.9125, lon: 69.7831, type: 'capital', region_name: 'Хатлонская область' },
    // Узбекистан
    { name: 'Самарканд', lat: 39.6542, lon: 66.9597, type: 'capital', region_name: 'Самаркандская область' },
    { name: 'Бухара', lat: 39.7747, lon: 64.4286, type: 'capital', region_name: 'Бухарская область' },
    // Туркменистан
    { name: 'Туркменабад', lat: 39.0941, lon: 63.5786, type: 'capital', region_name: 'Лебапский велаят' },
    { name: 'Дашогуз', lat: 41.8333, lon: 59.9667, type: 'capital', region_name: 'Дашогузский велаят' },
];.