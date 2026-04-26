import { createContext, useContext, useState, useEffect } from "react";
import { getProfile } from "../services/user";
import { getWardrobe } from "../services/wardrobe";
import { getWeather, getAirQuality, getUserLocation, reverseGeocode } from "../services/weather";
import { isLoggedIn, logout } from "../services/auth";

const AppContext = createContext();

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [weather, setWeather] = useState(null);
  const [wardrobe, setWardrobe] = useState([]);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState(null);
  const [locationName, setLocationName] = useState(null);

  useEffect(() => {
    initialize();
  }, []);

  async function initialize() {
    try {
      // Load weather regardless of auth state
      await fetchWeather();

      // If logged in, load user profile and wardrobe
      if (isLoggedIn()) {
        await fetchUserAndWardrobe();
      }
    } catch (err) {
      console.error("Init error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchUserAndWardrobe() {
    try {
      const profile = await getProfile();
      setUser(profile);
      const wardrobeData = await getWardrobe();
      setWardrobe(wardrobeData.items || []);
    } catch (err) {
      console.error("Failed to load user/wardrobe:", err);
      // If profile fetch fails with 401, user is not authenticated
      if (err.status === 401) {
        logout();
        setUser(null);
      }
    }
  }

  async function fetchWeatherForCoords(lat, lon) {
    // Fetch weather first so we have current.time in the location's timezone,
    // then pass it to getAirQuality so it matches the correct hourly AQI slot.
    const weatherData = await getWeather(lat, lon);
    const currentTime = weatherData?.current?.time ?? null;
    const [environmental, name] = await Promise.all([
      getAirQuality(lat, lon, currentTime),
      reverseGeocode(lat, lon),
    ]);
    return { weatherData, environmental, name };
  }

  async function fetchWeather() {
    try {
      const loc = await getUserLocation();
      setLocation(loc);
      const { weatherData, environmental, name } = await fetchWeatherForCoords(loc.lat, loc.lon);
      setWeather({ ...weatherData, environmental });
      setLocationName(name);
    } catch (_err) {
      // // 🔥 VERY HOT
      const [fallbackLat, fallbackLon] = [17.039658, 9.443814];

      // // ☀️ HOT & SUNNY
      // const [fallbackLat, fallbackLon] = [25.2048, 55.2708];

      // // 🌤️ PLEASANT
      // const [fallbackLat, fallbackLon] = [-3.3305, 8.6952];

      // // ❄️ COLD & CLEAR
      // const [fallbackLat, fallbackLon] = [64.1466, -21.9426];

      // // ❄️ SNOWY
      // const [fallbackLat, fallbackLon] = [50.340014, -100.449692];

      // 🌧️ RAINY
      // const [fallbackLat, fallbackLon] = [37.401094, 127.91414];

      // // ⛈️ THUNDERSTORM
      // const [fallbackLat, fallbackLon] = [25.7617, -80.1918];

      // // 🌫️ FOGGY
      // const [fallbackLat, fallbackLon] = [37.7749, -122.4194];

      const { weatherData, environmental, name } = await fetchWeatherForCoords(fallbackLat, fallbackLon);
      setWeather({ ...weatherData, environmental });
      setLocationName(name);
      setLocation({ lat: fallbackLat, lon: fallbackLon });
    }
  }

  async function refreshWardrobe() {
    try {
      const wardrobeData = await getWardrobe();
      setWardrobe(wardrobeData.items || []);
    } catch (err) {
      console.error("Failed to refresh wardrobe:", err);
    }
  }

  async function refreshUser() {
    try {
      const profile = await getProfile();
      setUser(profile);
    } catch (err) {
      console.error("Failed to refresh user:", err);
    }
  }

  function handleLogout() {
    logout();
    setUser(null);
    setWardrobe([]);
  }

  return (
    <AppContext.Provider
      value={{
        user,
        setUser,
        weather,
        wardrobe,
        setWardrobe,
        loading,
        location,
        locationName,
        refreshWardrobe,
        refreshUser,
        handleLogout,
        fetchUserAndWardrobe,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}