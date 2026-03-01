export async function getWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,uv_index&hourly=temperature_2m,precipitation_probability&timezone=auto&forecast_days=1`;
  const res = await fetch(url);
  const data = await res.json();
  return data;
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