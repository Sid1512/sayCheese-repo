/**
 * Open-Meteo weather fetch for recommendations (warmth + rain pre-filter and LLM).
 * No API key required.
 */

const BASE = process.env.OPEN_METEO_WEATHER_URL || 'https://api.open-meteo.com/v1/forecast';

/**
 * WMO weather codes: 61-67 = rain, 71-77 = snow, 80-82 = showers, etc.
 * @see https://open-meteo.com/en/docs#weathervariables
 */
const RAIN_SNOW_CODES = new Set([
  61, 63, 65, 66, 67, 80, 81, 82, 71, 73, 75, 77, 85, 86,
]);

/**
 * Fetch current and today's outlook for a location.
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<{ temperature_c: number, feels_like_c: number, condition: string, weather_code: number, rain_probability: number, humidity: number, wind_kph: number }>}
 */
async function getWeatherForRecommendation(lat, lon) {
  const url = new URL(BASE);
  url.searchParams.set('latitude', lat);
  url.searchParams.set('longitude', lon);
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,precipitation,wind_speed_10m');
  url.searchParams.set('hourly', 'precipitation_probability');
  url.searchParams.set('daily', 'uv_index_max');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '1');

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Weather API error: ${res.status}`);
  }
  const data = await res.json();

  const current = data.current || {};
  const hourly = data.hourly || {};
  const daily = data.daily || {};
  const temp = current.temperature_2m ?? 15;
  const feelsLike = current.apparent_temperature ?? temp;
  const weatherCode = current.weather_code ?? 0;
  const precipProbPct = Array.isArray(hourly.precipitation_probability)
    ? Math.max(0, ...hourly.precipitation_probability.slice(0, 24))
    : 0;
  const rainProbability = precipProbPct / 100;
  const condition = codeToCondition(weatherCode);
  const is_rainy_or_snowy = RAIN_SNOW_CODES.has(weatherCode) || rainProbability >= 0.5;
  const uvIndex = Array.isArray(daily.uv_index_max) && daily.uv_index_max.length > 0
    ? daily.uv_index_max[0]
    : null;

  const weatherResult = {
    temperature_c: round(temp, 1),
    feels_like_c: round(feelsLike, 1),
    condition,
    weather_code: weatherCode,
    rain_probability: round(rainProbability, 2),
    humidity: current.relative_humidity_2m ?? null,
    wind_kph: current.wind_speed_10m ?? null,
    uv_index: uvIndex != null ? round(Number(uvIndex), 1) : null,
    is_rainy_or_snowy,
  };

  const logWeather =
    process.env.DEBUG_PREFILTER === '1' ||
    process.env.DEBUG_RECOMMENDATIONS === '1' ||
    process.env.NODE_ENV !== 'production';
  if (logWeather) {
    console.log('[weather] API response:', JSON.stringify(weatherResult, null, 2));
  }

  return weatherResult;
}

function codeToCondition(code) {
  if (code === 0) return 'clear';
  if (code <= 3) return 'partly_cloudy';
  if (code <= 49) return 'fog';
  if (code <= 59) return 'drizzle';
  if (code <= 69) return 'rain';
  if (code <= 79) return 'snow';
  if (code <= 82) return 'showers';
  if (code <= 86) return 'snow_showers';
  if (code <= 99) return 'thunderstorm';
  return 'unknown';
}

function round(n, d) {
  const m = 10 ** d;
  return Math.round(Number(n) * m) / m;
}

module.exports = { getWeatherForRecommendation, RAIN_SNOW_CODES };