import { createContext, useContext, useState, useEffect } from "react";
import { getProfile } from "../services/user";
import { getWardrobe } from "../services/wardrobe";
import { getWeather, getUserLocation, reverseGeocode } from "../services/weather";
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

  async function fetchWeather() {
    try {
      const loc = await getUserLocation();
      setLocation(loc);
      const fallbackLat = loc.lat;
      const fallbackLon = loc.lon;
      const [weatherData, name] = await Promise.all([
        getWeather(fallbackLat, fallbackLon),
        reverseGeocode(fallbackLat, fallbackLon),
      ]);
      setWeather(weatherData);
      setLocationName(name);
    } catch (_err) {
      // // 🔥 VERY HOT — Phoenix, Arizona
            // const [fallbackLat, fallbackLon] = [-23.79844, 117.260189];

            // // ☀️ HOT & SUNNY — Dubai
            // const [fallbackLat, fallbackLon] = [25.2048, 55.2708];

            // // 🌤️ PLEASANT — London
            // const [fallbackLat, fallbackLon] = [-3.3305, 8.6952];

            // // ❄️ COLD & CLEAR — Reykjavik
            // const [fallbackLat, fallbackLon] = [64.1466, -21.9426];

            // // ❄️ SNOWY — Anchorage
            // const [fallbackLat, fallbackLon] = [56.652232, -131.60332];

            // 🌧️ RAINY — Seattle
            const [fallbackLat, fallbackLon] = [-3.794748, 24.154905];

            // // ⛈️ THUNDERSTORM — Miami
            // const [fallbackLat, fallbackLon] = [25.7617, -80.1918];

            // // 🌫️ FOGGY — San Francisco
            // const [fallbackLat, fallbackLon] = [37.7749, -122.4194];

      const [data, name] = await Promise.all([
        getWeather(fallbackLat, fallbackLon),
        reverseGeocode(fallbackLat, fallbackLon),
      ]);
      setWeather(data);
      setLocationName(name);
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