

export interface Capital {
    name: string;
    lat: number;
    lon: number;
    type: 'country' | 'capital';
}

export const capitals: Capital[] = [
    // === Страны ===
    { name: 'Москва', lat: 55.7558, lon: 37.6176, type: 'country' },
    { name: 'Минск', lat: 53.9045, lon: 27.5615, type: 'country' },
    { name: 'Астана', lat: 51.1694, lon: 71.4491, type: 'country' },
    { name: 'Бишкек', lat: 42.8746, lon: 74.5698, type: 'country' },
    { name: 'Сухум', lat: 43.0013, lon: 41.0234, type: 'country' },
    { name: 'Ереван', lat: 40.1792, lon: 44.4991, type: 'country' },
    { name: 'Баку', lat: 40.4093, lon: 49.8671, type: 'country' },
    { name: 'Кишинёв', lat: 47.0105, lon: 28.8638, type: 'country' },
    { name: 'Душанбе', lat: 38.5598, lon: 68.7870, type: 'country' },
    { name: 'Ташкент', lat: 41.2995, lon: 69.2401, type: 'country' },
    { name: 'Ашхабад', lat: 37.9601, lon: 58.3261, type: 'country' },

    // === Регионы РФ ===
    // ЦФО
    { name: 'Санкт-Петербург', lat: 59.9343, lon: 30.3351, type: 'capital' }, // special status
    { name: 'Белгород', lat: 50.6000, lon: 36.6000, type: 'capital' },
    { name: 'Брянск', lat: 53.2521, lon: 34.3717, type: 'capital' },
    { name: 'Владимир', lat: 56.1290, lon: 40.4058, type: 'capital' },
    { name: 'Воронеж', lat: 51.6606, lon: 39.2003, type: 'capital' },
    { name: 'Иваново', lat: 57.0003, lon: 40.9739, type: 'capital' },
    { name: 'Калуга', lat: 54.5137, lon: 36.2613, type: 'capital' },
    { name: 'Кострома', lat: 57.7679, lon: 40.9269, type: 'capital' },
    { name: 'Курск', lat: 51.7373, lon: 36.1872, type: 'capital' },
    { name: 'Липецк', lat: 52.6074, lon: 39.5986, type: 'capital' },
    { name: 'Орёл', lat: 52.9694, lon: 36.0694, type: 'capital' },
    { name: 'Рязань', lat: 54.6269, lon: 39.7417, type: 'capital' },
    { name: 'Смоленск', lat: 54.7826, lon: 32.0453, type: 'capital' },
    { name: 'Тамбов', lat: 52.7211, lon: 41.4542, type: 'capital' },
    { name: 'Тверь', lat: 56.8584, lon: 35.9118, type: 'capital' },
    { name: 'Тула', lat: 54.1961, lon: 37.6182, type: 'capital' },
    { name: 'Ярославль', lat: 57.6265, lon: 39.8938, type: 'capital' },
    // СЗФО
    { name: 'Архангельск', lat: 64.5393, lon: 40.5187, type: 'capital' },
    { name: 'Вологда', lat: 59.2205, lon: 39.8915, type: 'capital' },
    { name: 'Калининград', lat: 54.7101, lon: 20.5101, type: 'capital' },
    { name: 'Мурманск', lat: 68.9707, lon: 33.0747, type: 'capital' },
    { name: 'Великий Новгород', lat: 58.5212, lon: 31.2758, type: 'capital' },
    { name: 'Псков', lat: 57.8136, lon: 28.3325, type: 'capital' },
    { name: 'Петрозаводск', lat: 61.7849, lon: 34.3512, type: 'capital' },
    { name: 'Сыктывкар', lat: 61.6684, lon: 50.8354, type: 'capital' },
    // ЮФО
    { name: 'Майкоп', lat: 44.6094, lon: 40.1057, type: 'capital' },
    { name: 'Элиста', lat: 46.3072, lon: 44.2681, type: 'capital' },
    { name: 'Симферополь', lat: 44.9484, lon: 34.1024, type: 'capital' },
    { name: 'Севастополь', lat: 44.6166, lon: 33.5254, type: 'capital' }, // special status
    { name: 'Краснодар', lat: 45.0355, lon: 38.9753, type: 'capital' },
    { name: 'Астрахань', lat: 46.3497, lon: 48.0302, type: 'capital' },
    { name: 'Волгоград', lat: 48.7080, lon: 44.5133, type: 'capital' },
    { name: 'Ростов-на-Дону', lat: 47.2333, lon: 39.7000, type: 'capital' },
    // СКФО
    { name: 'Махачкала', lat: 42.9831, lon: 47.5047, type: 'capital' },
    { name: 'Магас', lat: 43.1667, lon: 44.8167, type: 'capital' },
    { name: 'Нальчик', lat: 43.4833, lon: 43.6167, type: 'capital' },
    { name: 'Черкесск', lat: 44.2236, lon: 42.0522, type: 'capital' },
    { name: 'Владикавказ', lat: 43.0361, lon: 44.6675, type: 'capital' },
    { name: 'Грозный', lat: 43.3167, lon: 45.7000, type: 'capital' },
    { name: 'Ставрополь', lat: 45.0428, lon: 41.9734, type: 'capital' },
    // ПФО
    { name: 'Нижний Новгород', lat: 56.3269, lon: 44.0059, type: 'capital' },
    { name: 'Казань', lat: 55.7961, lon: 49.1064, type: 'capital' },
    { name: 'Самара', lat: 53.1959, lon: 50.1002, type: 'capital' },
    { name: 'Уфа', lat: 54.7351, lon: 55.9583, type: 'capital' },
    { name: 'Пермь', lat: 58.0105, lon: 56.2502, type: 'capital' },
    { name: 'Саратов', lat: 51.5335, lon: 46.0343, type: 'capital' },
    { name: 'Ижевск', lat: 56.8497, lon: 53.2045, type: 'capital' },
    { name: 'Ульяновск', lat: 54.3142, lon: 48.4036, type: 'capital' },
    { name: 'Оренбург', lat: 51.7682, lon: 55.0969, type: 'capital' },
    { name: 'Пенза', lat: 53.1959, lon: 45.0189, type: 'capital' },
    { name: 'Киров', lat: 58.6036, lon: 49.6680, type: 'capital' },
    { name: 'Чебоксары', lat: 56.1322, lon: 47.2519, type: 'capital' },
    { name: 'Саранск', lat: 54.1873, lon: 45.1834, type: 'capital' },
    { name: 'Йошкар-Ола', lat: 56.6333, lon: 47.8833, type: 'capital' },
    // УФО
    { name: 'Екатеринбург', lat: 56.8389, lon: 60.6057, type: 'capital' },
    { name: 'Челябинск', lat: 55.1644, lon: 61.4026, type: 'capital' },
    { name: 'Тюмень', lat: 57.1533, lon: 65.5343, type: 'capital' },
    { name: 'Ханты-Мансийск', lat: 61.0042, lon: 69.0019, type: 'capital' },
    { name: 'Курган', lat: 55.4500, lon: 65.3333, type: 'capital' },
    // СФО
    { name: 'Новосибирск', lat: 55.0301, lon: 82.9204, type: 'capital' },
    { name: 'Омск', lat: 54.9894, lon: 73.3686, type: 'capital' },
    { name: 'Красноярск', lat: 56.0105, lon: 92.8525, type: 'capital' },
    { name: 'Барнаул', lat: 53.3467, lon: 83.7768, type: 'capital' },
    { name: 'Иркутск', lat: 52.2869, lon: 104.3050, type: 'capital' },
    { name: 'Кемерово', lat: 55.3550, lon: 86.0883, type: 'capital' },
    { name: 'Улан-Удэ', lat: 51.8336, lon: 107.5844, type: 'capital' },
    { name: 'Томск', lat: 56.4846, lon: 84.9479, type: 'capital' },
    { name: 'Абакан', lat: 53.7167, lon: 91.4167, type: 'capital' },
    // ДФО
    { name: 'Владивосток', lat: 43.1167, lon: 131.8833, type: 'capital' },
    { name: 'Хабаровск', lat: 48.4827, lon: 135.0838, type: 'capital' },
    { name: 'Чита', lat: 52.0333, lon: 113.5000, type: 'capital' },
    { name: 'Якутск', lat: 62.0339, lon: 129.7331, type: 'capital' },
    { name: 'Благовещенск', lat: 50.2500, lon: 127.5333, type: 'capital' },
    { name: 'Южно-Сахалинск', lat: 46.9500, lon: 142.7333, type: 'capital' },
    { name: 'Петропавловск-Камчатский', lat: 53.0167, lon: 158.6500, type: 'capital' },
    { name: 'Магадан', lat: 59.5667, lon: 150.8000, type: 'capital' },
    { name: 'Биробиджан', lat: 48.7833, lon: 132.9500, type: 'capital' },
    { name: 'Анадырь', lat: 64.7333, lon: 177.5167, type: 'capital' },
    // Новые территории
    { name: 'Луганск', lat: 48.5740, lon: 39.3082, type: 'capital' },
    { name: 'Донецк', lat: 48.0159, lon: 37.8028, type: 'capital' },
    { name: 'Мелитополь', lat: 46.8491, lon: 35.3673, type: 'capital' },
    { name: 'Геническ', lat: 46.1742, lon: 34.8086, type: 'capital' },

    // === Крупные административные центры РФ ===
    { name: 'Норильск', lat: 69.3498, lon: 88.2023, type: 'capital' },
    { name: 'Сочи', lat: 43.5855, lon: 39.7233, type: 'capital' },
    { name: 'Новороссийск', lat: 44.7241, lon: 37.7675, type: 'capital' },
    { name: 'Таганрог', lat: 47.2167, lon: 38.9333, type: 'capital' },
    { name: 'Магнитогорск', lat: 53.4186, lon: 59.0472, type: 'capital' },
    { name: 'Нижний Тагил', lat: 57.9167, lon: 59.9667, type: 'capital' },
    { name: 'Стерлитамак', lat: 53.6333, lon: 55.9500, type: 'capital' },
    { name: 'Дзержинск', lat: 56.2367, lon: 43.4611, type: 'capital' },
    { name: 'Шахты', lat: 47.7167, lon: 40.2167, type: 'capital' },
    { name: 'Сургут', lat: 61.25, lon: 73.4167, type: 'capital' },
    { name: 'Ангарск', lat: 52.5167, lon: 103.9167, type: 'capital' },
    { name: 'Братск', lat: 56.1667, lon: 101.6167, type: 'capital' },
    { name: 'Орск', lat: 51.2167, lon: 58.5667, type: 'capital' },
    { name: 'Прокопьевск', lat: 53.9, lon: 86.7167, type: 'capital' },
    { name: 'Златоуст', lat: 55.1667, lon: 59.6667, type: 'capital' },
    { name: 'Миасс', lat: 55.05, lon: 60.1, type: 'capital' },
    { name: 'Каменск-Уральский', lat: 56.4167, lon: 61.9333, type: 'capital' },
    { name: 'Бийск', lat: 52.5167, lon: 85.1667, type: 'capital' },
    { name: 'Сызрань', lat: 53.15, lon: 48.4667, type: 'capital' },
    { name: 'Березники', lat: 59.4, lon: 56.7833, type: 'capital' },
    { name: 'Салават', lat: 53.3667, lon: 55.9333, type: 'capital' },
    { name: 'Копейск', lat: 55.1, lon: 61.6167, type: 'capital' },
    { name: 'Первоуральск', lat: 56.9167, lon: 59.95, type: 'capital' },

    // === Регионы СНГ ===
    // Беларусь
    { name: 'Гомель', lat: 52.4242, lon: 31.0084, type: 'capital' },
    { name: 'Могилёв', lat: 53.9100, lon: 30.3400, type: 'capital' },
    { name: 'Витебск', lat: 55.1904, lon: 30.2049, type: 'capital' },
    { name: 'Гродно', lat: 53.6884, lon: 23.8258, type: 'capital' },
    { name: 'Брест', lat: 52.0976, lon: 23.7341, type: 'capital' },
    // Казахстан
    { name: 'Алматы', lat: 43.2220, lon: 76.8512, type: 'capital' },
    { name: 'Шымкент', lat: 42.3167, lon: 69.6000, type: 'capital' },
    { name: 'Караганда', lat: 49.8333, lon: 73.1167, type: 'capital' },
    { name: 'Актобе', lat: 50.2833, lon: 57.1667, type: 'capital' },
    { name: 'Тараз', lat: 42.9000, lon: 71.3667, type: 'capital' },
    { name: 'Павлодар', lat: 52.3000, lon: 76.9500, type: 'capital' },
    { name: 'Усть-Каменогорск', lat: 49.9833, lon: 82.6167, type: 'capital' },
    { name: 'Семей', lat: 50.4167, lon: 80.2500, type: 'capital' },
    { name: 'Уральск', lat: 51.2333, lon: 51.3667, type: 'capital' },
    { name: 'Актау', lat: 43.6500, lon: 51.1667, type: 'capital' },
    // Кыргызстан
    { name: 'Ош', lat: 40.5167, lon: 72.8000, type: 'capital' },
    // Абхазия
    { name: 'Гагра', lat: 43.2800, lon: 40.2600, type: 'capital' },
    // Армения
    { name: 'Гюмри', lat: 40.7895, lon: 43.8449, type: 'capital' },
    { name: 'Ванадзор', lat: 40.8122, lon: 44.4912, type: 'capital' },
    // Азербайджан
    { name: 'Гянджа', lat: 40.6828, lon: 46.3606, type: 'capital' },
    { name: 'Сумгаит', lat: 40.5917, lon: 49.6686, type: 'capital' },
    // Молдова
    { name: 'Тирасполь', lat: 46.8403, lon: 29.6133, type: 'capital' },
    { name: 'Бельцы', lat: 47.7618, lon: 27.9252, type: 'capital' },
    // Таджикистан
    { name: 'Худжанд', lat: 40.2858, lon: 69.6231, type: 'capital' },
    { name: 'Куляб', lat: 37.9125, lon: 69.7831, type: 'capital' },
    // Узбекистан
    { name: 'Самарканд', lat: 39.6542, lon: 66.9597, type: 'capital' },
    { name: 'Бухара', lat: 39.7747, lon: 64.4286, type: 'capital' },
    // Туркменистан
    { name: 'Туркменабад', lat: 39.0941, lon: 63.5786, type: 'capital' },
    { name: 'Дашогуз', lat: 41.8333, lon: 59.9667, type: 'capital' },
];