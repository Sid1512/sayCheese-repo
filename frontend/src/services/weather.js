export async function getWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,uv_index&hourly=temperature_2m,precipitation_probability&timezone=auto&forecast_days=1`;
  const res = await fetch(url);
  const data = await res.json();
  return data;
}

export async function getAirQuality(lat, lon, currentTime) {
  try {
    const url = `https://air-quality.api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=us_aqi,pollen_grass,pollen_tree,pollen_weed&timezone=auto&forecast_days=1`;
    const res = await fetch(url);
    const data = await res.json();

    const hourlyTime = Array.isArray(data?.hourly?.time) ? data.hourly.time : [];
    // Use the location's current time from the weather response (e.g. "2026-03-01T14:30")
    // which is already in the location's local timezone — same as the AQI hourly times.
    // Fallback to device UTC only if not available (will be off in non-UTC timezones).
    const localHour = currentTime
      ? String(currentTime).slice(0, 13)
      : new Date().toISOString().slice(0, 13);
    let idx = hourlyTime.findIndex((t) => String(t).slice(0, 13) === localHour);
    if (idx < 0) idx = 0;
    const pick = (arr) => (Array.isArray(arr) && arr.length > idx ? arr[idx] : null);
    return {
      us_aqi: pick(data?.hourly?.us_aqi),
      pollen_grass: pick(data?.hourly?.pollen_grass),
      pollen_tree: pick(data?.hourly?.pollen_tree),
      pollen_weed: pick(data?.hourly?.pollen_weed),
    };
  } catch {
    return {
      us_aqi: 72,
      pollen_grass: 2,
      pollen_tree: 1,
      pollen_weed: 2,
    };
  }
}

export function getWeatherDescription(code) {
  if (code === 0) return { label: "Clear Sky", icon: "☀️", risk: "low" };
  if (code <= 3) return { label: "Partly Cloudy", icon: "⛅", risk: "low" };
  if (code <= 48) return { label: "Foggy", icon: "🌫️", risk: "medium" };
  if (code <= 67) return { label: "Rainy", icon: "🌧️", risk: "high" };
  if (code <= 77) return { label: "Snowy", icon: "❄️", risk: "high" };
  if (code <= 82) return { label: "Showers", icon: "🌦️", risk: "medium" };
  if (code <= 99) return { label: "Thunderstorm", icon: "⛈️", risk: "high" };
  return { label: "Unknown", icon: "🌡️", risk: "low" };
}

export function getUserLocation() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err)
    );
  });
}

/**
 * Returns today's date as YYYY-MM-DD using the location's current time.
 * Prefers weather.current.time (e.g. "2026-03-01T14:30") which is already
 * expressed in local time at the location. Falls back to IANA timezone string,
 * then device local time.
 */
export function locationDate(currentTime, timezone) {
  // Primary: currentTime from Open-Meteo e.g. "2026-03-01T14:30"
  if (currentTime && typeof currentTime === "string" && currentTime.includes("T")) {
    return currentTime.split("T")[0];
  }
  // Secondary: IANA timezone string e.g. "America/New_York"
  if (timezone && typeof timezone === "string" && !timezone.includes("T")) {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      const get = (type) => parts.find((p) => p.type === type).value;
      return `${get("year")}-${get("month")}-${get("day")}`;
    } catch {
      // fall through to device local
    }
  }
  // Final fallback: device local date
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`
    );
    const data = await res.json();
    return (
      data.address?.city ||
      data.address?.town ||
      data.address?.village ||
      data.address?.suburb ||
      data.address?.county ||
      data.address?.state_district ||
      data.address?.state ||
      data.address?.country ||
      "Unknown Location"
    );
  } catch {
    return "Unknown Location";
  }
}