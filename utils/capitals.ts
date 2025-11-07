
export interface Capital {
    name: string;
    lat: number;
    lon: number;
    type: 'country' | 'regional';
}

export const capitals: Capital[] = [
    // === Страны ===
    { name: 'Москва', lat: 55.7558, lon: 37.6176, type: 'country' },
    { name: 'Минск', lat: 53.9045, lon: 27.5615, type: 'country' },
    { name: 'Астана', lat: 51.1694, lon: 71.4491, type: 'country' },
    { name: 'Бишкек', lat: 42.8746, lon: 74.5698, type: 'country' },
    { name: 'Сухум', lat: 43.0013, lon: 41.0234, type: 'country' },

    // === Регионы РФ ===
    // ЦФО
    { name: 'Санкт-Петербург', lat: 59.9343, lon: 30.3351, type: 'regional' }, // special status
    { name: 'Белгород', lat: 50.6000, lon: 36.6000, type: 'regional' },
    { name: 'Брянск', lat: 53.2521, lon: 34.3717, type: 'regional' },
    { name: 'Владимир', lat: 56.1290, lon: 40.4058, type: 'regional' },
    { name: 'Воронеж', lat: 51.6606, lon: 39.2003, type: 'regional' },
    { name: 'Иваново', lat: 57.0003, lon: 40.9739, type: 'regional' },
    { name: 'Калуга', lat: 54.5137, lon: 36.2613, type: 'regional' },
    { name: 'Кострома', lat: 57.7679, lon: 40.9269, type: 'regional' },
    { name: 'Курск', lat: 51.7373, lon: 36.1872, type: 'regional' },
    { name: 'Липецк', lat: 52.6074, lon: 39.5986, type: 'regional' },
    { name: 'Орёл', lat: 52.9694, lon: 36.0694, type: 'regional' },
    { name: 'Рязань', lat: 54.6269, lon: 39.7417, type: 'regional' },
    { name: 'Смоленск', lat: 54.7826, lon: 32.0453, type: 'regional' },
    { name: 'Тамбов', lat: 52.7211, lon: 41.4542, type: 'regional' },
    { name: 'Тверь', lat: 56.8584, lon: 35.9118, type: 'regional' },
    { name: 'Тула', lat: 54.1961, lon: 37.6182, type: 'regional' },
    { name: 'Ярославль', lat: 57.6265, lon: 39.8938, type: 'regional' },
    // СЗФО
    { name: 'Архангельск', lat: 64.5393, lon: 40.5187, type: 'regional' },
    { name: 'Вологда', lat: 59.2205, lon: 39.8915, type: 'regional' },
    { name: 'Калининград', lat: 54.7101, lon: 20.5101, type: 'regional' },
    { name: 'Мурманск', lat: 68.9707, lon: 33.0747, type: 'regional' },
    { name: 'Великий Новгород', lat: 58.5212, lon: 31.2758, type: 'regional' },
    { name: 'Псков', lat: 57.8136, lon: 28.3325, type: 'regional' },
    { name: 'Петрозаводск', lat: 61.7849, lon: 34.3512, type: 'regional' },
    { name: 'Сыктывкар', lat: 61.6684, lon: 50.8354, type: 'regional' },
    // ЮФО
    { name: 'Майкоп', lat: 44.6094, lon: 40.1057, type: 'regional' },
    { name: 'Элиста', lat: 46.3072, lon: 44.2681, type: 'regional' },
    { name: 'Симферополь', lat: 44.9484, lon: 34.1024, type: 'regional' },
    { name: 'Севастополь', lat: 44.6166, lon: 33.5254, type: 'regional' }, // special status
    { name: 'Краснодар', lat: 45.0355, lon: 38.9753, type: 'regional' },
    { name: 'Астрахань', lat: 46.3497, lon: 48.0302, type: 'regional' },
    { name: 'Волгоград', lat: 48.7080, lon: 44.5133, type: 'regional' },
    { name: 'Ростов-на-Дону', lat: 47.2333, lon: 39.7000, type: 'regional' },
    // СКФО
    { name: 'Махачкала', lat: 42.9831, lon: 47.5047, type: 'regional' },
    { name: 'Магас', lat: 43.1667, lon: 44.8167, type: 'regional' },
    { name: 'Нальчик', lat: 43.4833, lon: 43.6167, type: 'regional' },
    { name: 'Черкесск', lat: 44.2236, lon: 42.0522, type: 'regional' },
    { name: 'Владикавказ', lat: 43.0361, lon: 44.6675, type: 'regional' },
    { name: 'Грозный', lat: 43.3167, lon: 45.7000, type: 'regional' },
    { name: 'Ставрополь', lat: 45.0428, lon: 41.9734, type: 'regional' },
    // ПФО
    { name: 'Нижний Новгород', lat: 56.3269, lon: 44.0059, type: 'regional' },
    { name: 'Казань', lat: 55.7961, lon: 49.1064, type: 'regional' },
    { name: 'Самара', lat: 53.1959, lon: 50.1002, type: 'regional' },
    { name: 'Уфа', lat: 54.7351, lon: 55.9583, type: 'regional' },
    { name: 'Пермь', lat: 58.0105, lon: 56.2502, type: 'regional' },
    { name: 'Саратов', lat: 51.5335, lon: 46.0343, type: 'regional' },
    { name: 'Ижевск', lat: 56.8497, lon: 53.2045, type: 'regional' },
    { name: 'Ульяновск', lat: 54.3142, lon: 48.4036, type: 'regional' },
    { name: 'Оренбург', lat: 51.7682, lon: 55.0969, type: 'regional' },
    { name: 'Пенза', lat: 53.1959, lon: 45.0189, type: 'regional' },
    { name: 'Киров', lat: 58.6036, lon: 49.6680, type: 'regional' },
    { name: 'Чебоксары', lat: 56.1322, lon: 47.2519, type: 'regional' },
    { name: 'Саранск', lat: 54.1873, lon: 45.1834, type: 'regional' },
    { name: 'Йошкар-Ола', lat: 56.6333, lon: 47.8833, type: 'regional' },
    // УФО
    { name: 'Екатеринбург', lat: 56.8389, lon: 60.6057, type: 'regional' },
    { name: 'Челябинск', lat: 55.1644, lon: 61.4026, type: 'regional' },
    { name: 'Тюмень', lat: 57.1533, lon: 65.5343, type: 'regional' },
    { name: 'Ханты-Мансийск', lat: 61.0042, lon: 69.0019, type: 'regional' },
    { name: 'Курган', lat: 55.4500, lon: 65.3333, type: 'regional' },
    // СФО
    { name: 'Новосибирск', lat: 55.0301, lon: 82.9204, type: 'regional' },
    { name: 'Омск', lat: 54.9894, lon: 73.3686, type: 'regional' },
    { name: 'Красноярск', lat: 56.0105, lon: 92.8525, type: 'regional' },
    { name: 'Барнаул', lat: 53.3467, lon: 83.7768, type: 'regional' },
    { name: 'Иркутск', lat: 52.2869, lon: 104.3050, type: 'regional' },
    { name: 'Кемерово', lat: 55.3550, lon: 86.0883, type: 'regional' },
    { name: 'Улан-Удэ', lat: 51.8336, lon: 107.5844, type: 'regional' },
    { name: 'Томск', lat: 56.4846, lon: 84.9479, type: 'regional' },
    { name: 'Абакан', lat: 53.7167, lon: 91.4167, type: 'regional' },
    // ДФО
    { name: 'Владивосток', lat: 43.1167, lon: 131.8833, type: 'regional' },
    { name: 'Хабаровск', lat: 48.4827, lon: 135.0838, type: 'regional' },
    { name: 'Чита', lat: 52.0333, lon: 113.5000, type: 'regional' },
    { name: 'Якутск', lat: 62.0339, lon: 129.7331, type: 'regional' },
    { name: 'Благовещенск', lat: 50.2500, lon: 127.5333, type: 'regional' },
    { name: 'Южно-Сахалинск', lat: 46.9500, lon: 142.7333, type: 'regional' },
    { name: 'Петропавловск-Камчатский', lat: 53.0167, lon: 158.6500, type: 'regional' },
    { name: 'Магадан', lat: 59.5667, lon: 150.8000, type: 'regional' },
    { name: 'Биробиджан', lat: 48.7833, lon: 132.9500, type: 'regional' },
    { name: 'Анадырь', lat: 64.7333, lon: 177.5167, type: 'regional' },
    // Новые территории
    { name: 'Луганск', lat: 48.5740, lon: 39.3082, type: 'regional' },
    { name: 'Донецк', lat: 48.0159, lon: 37.8028, type: 'regional' },
    { name: 'Мелитополь', lat: 46.8491, lon: 35.3673, type: 'regional' },
    { name: 'Геническ', lat: 46.1742, lon: 34.8086, type: 'regional' },

    // === Регионы СНГ ===
    // Беларусь
    { name: 'Гомель', lat: 52.4242, lon: 31.0084, type: 'regional' },
    { name: 'Могилёв', lat: 53.9100, lon: 30.3400, type: 'regional' },
    { name: 'Витебск', lat: 55.1904, lon: 30.2049, type: 'regional' },
    { name: 'Гродно', lat: 53.6884, lon: 23.8258, type: 'regional' },
    { name: 'Брест', lat: 52.0976, lon: 23.7341, type: 'regional' },
    // Казахстан
    { name: 'Алматы', lat: 43.2220, lon: 76.8512, type: 'regional' },
    { name: 'Шымкент', lat: 42.3167, lon: 69.6000, type: 'regional' },
    { name: 'Караганда', lat: 49.8333, lon: 73.1167, type: 'regional' },
    { name: 'Актобе', lat: 50.2833, lon: 57.1667, type: 'regional' },
    { name: 'Тараз', lat: 42.9000, lon: 71.3667, type: 'regional' },
    { name: 'Павлодар', lat: 52.3000, lon: 76.9500, type: 'regional' },
    { name: 'Усть-Каменогорск', lat: 49.9833, lon: 82.6167, type: 'regional' },
    { name: 'Семей', lat: 50.4167, lon: 80.2500, type: 'regional' },
    { name: 'Уральск', lat: 51.2333, lon: 51.3667, type: 'regional' },
    { name: 'Актау', lat: 43.6500, lon: 51.1667, type: 'regional' },
    // Кыргызстан
    { name: 'Ош', lat: 40.5167, lon: 72.8000, type: 'regional' },
    // Абхазия
    { name: 'Гагра', lat: 43.2800, lon: 40.2600, type: 'regional' },
];
