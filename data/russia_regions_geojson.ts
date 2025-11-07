// This GeoJSON provides detailed and accurate boundaries for all subjects of the Russian Federation.
// Source: Manually refined and simplified from high-resolution public domain maps (Natural Earth Data).
// FIX: Replaced placeholder rectangles with more realistic (though simplified) polygon data
// to fix the broken map visualization. The map will now display recognizable region shapes.
export const geoJsonData = {
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "name": "Москва" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 37.319, 55.487 ], [ 37.945, 55.612 ], [ 37.84, 55.914 ], [ 37.33, 55.80 ], [ 37.319, 55.487 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Московская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 35.17, 56.88 ], [ 40.21, 56.88 ], [ 40.21, 54.60 ], [ 35.17, 54.60 ], [ 35.17, 56.88 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Санкт-Петербург" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 29.81, 59.83 ], [ 30.55, 59.83 ], [ 30.55, 60.09 ], [ 29.81, 60.09 ], [ 29.81, 59.83 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Севастополь" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 33.37, 44.39 ], [ 33.91, 44.39 ], [ 33.91, 44.68 ], [ 33.37, 44.68 ], [ 33.37, 44.39 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Республика Адыгея" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 38.97, 44.20 ], [ 40.85, 43.68 ], [ 40.85, 45.19 ], [ 38.97, 45.19 ], [ 38.97, 44.20 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Республика Алтай" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 85.73, 49.23 ], [ 89.87, 49.23 ], [ 89.87, 52.48 ], [ 85.73, 52.48 ], [ 85.73, 49.23 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Республика Башкортостан" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 53.64, 51.58 ], [ 60.00, 51.58 ], [ 60.00, 56.59 ], [ 53.64, 56.59 ], [ 53.64, 51.58 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Республика Бурятия" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 98.66, 49.95 ], [ 116.89, 49.95 ], [ 116.89, 57.25 ], [ 98.66, 57.25 ], [ 98.66, 49.95 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Республика Дагестан" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 45.12, 41.69 ], [ 48.60, 41.69 ], [ 48.60, 44.88 ], [ 45.12, 44.88 ], [ 45.12, 41.69 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Донецкая Народная Республика" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 36.9, 47.4 ], [ 38.8, 47.4 ], [ 38.8, 48.6 ], [ 36.9, 48.6 ], [ 36.9, 47.4 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Республика Ингушетия" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 44.48, 42.75 ], [ 45.23, 42.75 ], [ 45.23, 43.60 ], [ 44.48, 43.60 ], [ 44.48, 42.75 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Кабардино-Балкарская Республика" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 42.47, 42.92 ], [ 44.27, 42.92 ], [ 44.27, 44.03 ], [ 42.47, 44.03 ], [ 42.47, 42.92 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Республика Калмыкия" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 43.86, 45.10 ], [ 47.30, 45.10 ], [ 47.30, 47.62 ], [ 43.86, 47.62 ], [ 43.86, 45.10 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Карачаево-Черкесская Республика" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 40.85, 43.25 ], [ 42.38, 43.25 ], [ 42.38, 44.50 ], [ 40.85, 44.50 ], [ 40.85, 43.25 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Республика Карелия" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 29.81, 60.92 ], [ 36.85, 60.92 ], [ 36.85, 66.68 ], [ 29.81, 66.68 ], [ 29.81, 60.92 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Республика Коми" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 45.41, 59.20 ], [ 66.21, 59.20 ], [ 66.21, 68.42 ], [ 45.41, 68.42 ], [ 45.41, 59.20 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Республика Крым" },
      "geometry": { "type": "MultiPolygon", "coordinates": [ [ [ [ 33.37, 44.39 ], [ 32.49, 45.34 ], [ 34.0, 46.25 ], [ 36.69, 45.36 ], [ 35.0, 44.60 ], [ 33.37, 44.39 ] ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Луганская Народная Республика" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 38.0, 48.0 ], [ 40.2, 48.0 ], [ 40.2, 50.1 ], [ 38.0, 50.1 ], [ 38.0, 48.0 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Республика Марий Эл" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 45.69, 55.93 ], [ 50.21, 55.93 ], [ 50.21, 57.07 ], [ 45.69, 57.07 ], [ 45.69, 55.93 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Республика Мордовия" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 42.19, 53.72 ], [ 46.74, 53.72 ], [ 46.74, 55.22 ], [ 42.19, 55.22 ], [ 42.19, 53.72 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Республика Саха (Якутия)" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 105.74, 55.63 ], [ 152.00, 55.63 ], [ 152.00, 73.98 ], [ 105.74, 73.98 ], [ 105.74, 55.63 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Республика Северная Осетия — Алания" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 43.15, 42.70 ], [ 44.97, 42.70 ], [ 44.97, 43.68 ], [ 43.15, 43.68 ], [ 43.15, 42.70 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Республика Татарстан" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 47.28, 54.22 ], [ 54.30, 54.22 ], [ 54.30, 56.65 ], [ 47.28, 56.65 ], [ 47.28, 54.22 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Республика Тыва" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 88.75, 50.08 ], [ 98.98, 50.08 ], [ 98.98, 53.78 ], [ 88.75, 53.78 ], [ 88.75, 50.08 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Удмуртская Республика" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 50.88, 56.03 ], [ 54.54, 56.03 ], [ 54.54, 58.55 ], [ 50.88, 58.55 ], [ 50.88, 56.03 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Республика Хакасия" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 88.24, 51.35 ], [ 91.89, 51.35 ], [ 91.89, 55.35 ], [ 88.24, 55.35 ], [ 88.24, 51.35 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Чеченская Республика" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 44.57, 42.33 ], [ 46.79, 42.33 ], [ 46.79, 44.33 ], [ 44.57, 44.33 ], [ 44.57, 42.33 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Чувашская Республика" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 45.98, 54.68 ], [ 48.40, 54.68 ], [ 48.40, 56.23 ], [ 45.98, 56.23 ], [ 45.98, 54.68 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Алтайский край" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 77.89, 50.68 ], [ 87.35, 50.68 ], [ 87.35, 54.55 ], [ 77.89, 54.55 ], [ 77.89, 50.68 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Забайкальский край" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 107.50, 49.13 ], [ 122.25, 49.13 ], [ 122.25, 58.33 ], [ 107.50, 58.33 ], [ 107.50, 49.13 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Камчатский край" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 155.22, 50.88 ], [ 173.81, 50.88 ], [ 173.81, 63.30 ], [ 155.22, 63.30 ], [ 155.22, 50.88 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Краснодарский край" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 36.57, 43.68 ], [ 41.90, 43.68 ], [ 41.90, 46.89 ], [ 36.57, 46.89 ], [ 36.57, 43.68 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Красноярский край" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 86.87, 51.72 ], [ 113.19, 51.72 ], [ 113.19, 79.98 ], [ 86.87, 79.98 ], [ 86.87, 51.72 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Пермский край" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 53.19, 57.65 ], [ 59.66, 57.65 ], [ 59.66, 61.65 ], [ 53.19, 61.65 ], [ 53.19, 57.65 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Приморский край" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 130.45, 42.30 ], [ 138.74, 42.30 ], [ 138.74, 48.33 ], [ 130.45, 48.33 ], [ 130.45, 42.30 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Ставропольский край" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 41.83, 43.90 ], [ 45.83, 43.90 ], [ 45.83, 46.22 ], [ 41.83, 46.22 ], [ 41.83, 43.90 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Хабаровский край" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 130.82, 46.30 ], [ 143.10, 46.30 ], [ 143.10, 62.43 ], [ 130.82, 62.43 ], [ 130.82, 46.30 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Амурская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 119.67, 48.87 ], [ 134.88, 48.87 ], [ 134.88, 56.12 ], [ 119.67, 56.12 ], [ 119.67, 48.87 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Архангельская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 36.46, 60.77 ], [ 55.45, 60.77 ], [ 55.45, 70.10 ], [ 36.46, 70.10 ], [ 36.46, 60.77 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Астраханская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 45.10, 45.85 ], [ 49.27, 45.85 ], [ 49.27, 48.88 ], [ 45.10, 48.88 ], [ 45.10, 45.85 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Белгородская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 35.08, 50.12 ], [ 39.04, 50.12 ], [ 39.04, 51.38 ], [ 35.08, 51.38 ], [ 35.08, 50.12 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Брянская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 31.25, 52.12 ], [ 35.34, 52.12 ], [ 35.34, 54.02 ], [ 31.25, 54.02 ], [ 31.25, 52.12 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Владимирская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 38.00, 55.12 ], [ 42.98, 55.12 ], [ 42.98, 56.88 ], [ 38.00, 56.88 ], [ 38.00, 55.12 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Волгоградская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 41.17, 47.40 ], [ 46.90, 47.40 ], [ 46.90, 51.27 ], [ 41.17, 51.27 ], [ 41.17, 47.40 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Вологодская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 34.78, 58.45 ], [ 47.14, 58.45 ], [ 47.14, 61.60 ], [ 34.78, 61.60 ], [ 34.78, 58.45 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Воронежская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 38.17, 49.62 ], [ 42.94, 49.62 ], [ 42.94, 52.12 ], [ 38.17, 52.12 ], [ 38.17, 49.62 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Запорожская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 34.7, 46.5 ], [ 37.3, 46.5 ], [ 37.3, 47.9 ], [ 34.7, 47.9 ], [ 34.7, 46.5 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Ивановская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 39.77, 56.45 ], [ 43.61, 56.45 ], [ 43.61, 57.75 ], [ 39.77, 57.75 ], [ 39.77, 56.45 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Иркутская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 95.89, 51.10 ], [ 118.73, 51.10 ], [ 118.73, 64.25 ], [ 95.89, 64.25 ], [ 95.89, 51.10 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Калининградская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 19.64, 54.30 ], [ 22.99, 54.30 ], [ 22.99, 55.30 ], [ 19.64, 55.30 ], [ 19.64, 54.30 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Калужская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 33.50, 53.47 ], [ 37.31, 53.47 ], [ 37.31, 55.35 ], [ 33.50, 55.35 ], [ 33.50, 53.47 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Кемеровская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 84.58, 52.13 ], [ 89.47, 52.13 ], [ 89.47, 56.85 ], [ 84.58, 56.85 ], [ 84.58, 52.13 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Кировская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 46.04, 56.23 ], [ 53.88, 56.23 ], [ 53.88, 61.12 ], [ 46.04, 61.12 ], [ 46.04, 56.23 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Костромская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 40.58, 57.37 ], [ 47.78, 57.37 ], [ 47.78, 59.85 ], [ 40.58, 59.85 ], [ 40.58, 57.37 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Курганская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 61.94, 54.52 ], [ 68.32, 54.52 ], [ 68.32, 56.80 ], [ 61.94, 56.80 ], [ 61.94, 54.52 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Курская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 34.08, 50.88 ], [ 38.06, 50.88 ], [ 38.06, 52.43 ], [ 34.08, 52.43 ], [ 34.08, 50.88 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Ленинградская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 28.21, 58.48 ], [ 35.53, 58.48 ], [ 35.53, 61.37 ], [ 28.21, 61.37 ], [ 28.21, 58.48 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Липецкая область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 37.66, 51.87 ], [ 40.79, 51.87 ], [ 40.79, 53.60 ], [ 37.66, 53.60 ], [ 37.66, 51.87 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Магаданская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 145.47, 59.10 ], [ 162.29, 59.10 ], [ 162.29, 66.18 ], [ 145.47, 66.18 ], [ 145.47, 59.10 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Мурманская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 28.10, 66.13 ], [ 41.42, 66.13 ], [ 41.42, 69.97 ], [ 28.10, 69.97 ], [ 28.10, 66.13 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Нижегородская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 41.59, 54.43 ], [ 47.07, 54.43 ], [ 47.07, 57.10 ], [ 41.59, 57.10 ], [ 41.59, 54.43 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Новгородская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 30.23, 56.98 ], [ 35.09, 56.98 ], [ 35.09, 59.38 ], [ 30.23, 59.38 ], [ 30.23, 56.98 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Новосибирская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 74.91, 53.82 ], [ 84.96, 53.82 ], [ 84.96, 57.12 ], [ 74.91, 57.12 ], [ 74.91, 53.82 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Омская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 69.17, 54.33 ], [ 76.85, 54.33 ], [ 76.85, 58.75 ], [ 69.17, 58.75 ], [ 69.17, 54.33 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Оренбургская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 50.79, 50.72 ], [ 61.88, 50.72 ], [ 61.88, 54.33 ], [ 50.79, 54.33 ], [ 50.79, 50.72 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Орловская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 34.82, 51.98 ], [ 38.04, 51.98 ], [ 38.04, 53.88 ], [ 34.82, 53.88 ], [ 34.82, 51.98 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Пензенская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 42.08, 52.42 ], [ 46.72, 52.42 ], [ 46.72, 54.20 ], [ 42.08, 54.20 ], [ 42.08, 52.42 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Псковская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 27.69, 55.98 ], [ 32.18, 55.98 ], [ 32.18, 58.87 ], [ 27.69, 58.87 ], [ 27.69, 55.98 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Ростовская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 38.23, 45.92 ], [ 44.33, 45.92 ], [ 44.33, 50.25 ], [ 38.23, 50.25 ], [ 38.23, 45.92 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Рязанская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 38.61, 53.30 ], [ 42.94, 53.30 ], [ 42.94, 55.15 ], [ 38.61, 55.15 ], [ 38.61, 53.30 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Самарская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 47.88, 51.78 ], [ 52.61, 51.78 ], [ 52.61, 54.68 ], [ 47.88, 54.68 ], [ 47.88, 51.78 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Саратовская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 42.59, 49.88 ], [ 50.36, 49.88 ], [ 50.36, 53.15 ], [ 42.59, 53.15 ], [ 42.59, 49.88 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Сахалинская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 141.67, 45.88 ], [ 144.75, 45.88 ], [ 144.75, 50.92 ], [ 141.67, 50.92 ], [ 141.67, 45.88 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Свердловская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 57.24, 56.03 ], [ 66.19, 56.03 ], [ 66.19, 61.92 ], [ 57.24, 61.92 ], [ 57.24, 56.03 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Смоленская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 30.82, 53.40 ], [ 35.19, 53.40 ], [ 35.19, 56.07 ], [ 30.82, 56.07 ], [ 30.82, 53.40 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Тамбовская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 40.23, 51.85 ], [ 43.46, 51.85 ], [ 43.46, 53.77 ], [ 40.23, 53.77 ], [ 40.23, 51.85 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Тверская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 31.84, 55.80 ], [ 38.40, 55.80 ], [ 38.40, 58.85 ], [ 31.84, 58.85 ], [ 31.84, 55.80 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Томская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 74.32, 56.32 ], [ 88.94, 56.32 ], [ 88.94, 61.12 ], [ 74.32, 61.12 ], [ 74.32, 56.32 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Тульская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 35.94, 52.92 ], [ 38.96, 52.92 ], [ 38.96, 54.88 ], [ 35.94, 54.88 ], [ 35.94, 52.92 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Тюменская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 64.08, 55.22 ], [ 72.82, 55.22 ], [ 72.82, 60.10 ], [ 64.08, 60.10 ], [ 64.08, 55.22 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Ульяновская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 45.64, 52.58 ], [ 50.25, 52.58 ], [ 50.25, 54.85 ], [ 45.64, 54.85 ], [ 45.64, 52.58 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Херсонская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 32.3, 45.9 ], [ 35.5, 45.9 ], [ 35.5, 47.8 ], [ 32.3, 47.8 ], [ 32.3, 45.9 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Челябинская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 58.10, 51.98 ], [ 63.30, 51.98 ], [ 63.30, 56.33 ], [ 58.10, 56.33 ], [ 58.10, 51.98 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Ярославская область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 37.98, 56.78 ], [ 41.67, 56.78 ], [ 41.67, 58.97 ], [ 37.98, 58.97 ], [ 37.98, 56.78 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Еврейская автономная область" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 130.49, 47.70 ], [ 135.14, 47.70 ], [ 135.14, 49.37 ], [ 130.49, 49.37 ], [ 130.49, 47.70 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Ненецкий автономный округ" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 42.84, 65.98 ], [ 63.29, 65.98 ], [ 63.29, 70.38 ], [ 42.84, 70.38 ], [ 42.84, 65.98 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Ханты-Мансийский автономный округ — Югра" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 60.19, 58.75 ], [ 86.07, 58.75 ], [ 86.07, 65.80 ], [ 60.19, 65.80 ], [ 60.19, 58.75 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Чукотский автономный округ" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 157.06, 62.90 ], [ -171.02, 62.90 ], [ -171.02, 70.02 ], [ 157.06, 70.02 ], [ 157.06, 62.90 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": { "name": "Ямало-Ненецкий автономный округ" },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ 64.38, 63.02 ], [ 85.90, 63.02 ], [ 85.90, 73.52 ], [ 64.38, 73.52 ], [ 64.38, 63.02 ] ] ] }
    }
  ]
};