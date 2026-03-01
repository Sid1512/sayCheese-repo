import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider, useApp } from "./context/AppContext";
import Home from "./pages/Home";
import Profile from "./pages/Profile";
import Wardrobe from "./pages/Wardrobe";
import Onboarding from "./pages/Onboarding";
import Navbar from "./components/Navbar";
import WeatherBackground from "./components/WeatherBackground";
import { createContext, useContext } from "react";

export const ThemeContext = createContext({ isDark: true });
export function useTheme() { return useContext(ThemeContext); }

function getWeatherTheme(weatherCode, temp) {
  if (weatherCode === undefined || weatherCode === null)
    return { bg: "from-blue-950 via-blue-900 to-indigo-900", isDark: true };
  if (weatherCode >= 95)
    return { bg: "from-gray-900 via-slate-800 to-gray-900", isDark: true };
  if (weatherCode >= 71 && weatherCode <= 77)
    return { bg: "from-slate-200 via-blue-100 to-slate-300", isDark: false };
  if (weatherCode >= 61 && weatherCode <= 67)
    return { bg: "from-slate-800 via-blue-900 to-slate-900", isDark: true };
  if (weatherCode >= 51 && weatherCode <= 57)
    return { bg: "from-slate-700 via-blue-800 to-slate-800", isDark: true };
  if (weatherCode >= 45 && weatherCode <= 48)
    return { bg: "from-gray-600 via-gray-500 to-gray-700", isDark: true };
  if (weatherCode >= 80 && weatherCode <= 82)
    return { bg: "from-slate-700 via-indigo-800 to-slate-800", isDark: true };
  if (weatherCode === 0 || weatherCode <= 3) {
    if (temp >= 35) return { bg: "from-orange-900 via-red-800 to-orange-900", isDark: true };
    if (temp >= 25) return { bg: "from-orange-700 via-amber-600 to-yellow-700", isDark: true };
    if (temp >= 15) return { bg: "from-blue-600 via-sky-500 to-blue-700", isDark: true };
    if (temp >= 5)  return { bg: "from-blue-800 via-blue-700 to-indigo-800", isDark: true };
    return { bg: "from-blue-950 via-indigo-900 to-slate-900", isDark: true };
  }
  if (temp >= 25) return { bg: "from-amber-800 via-orange-700 to-amber-900", isDark: true };
  if (temp >= 15) return { bg: "from-blue-700 via-slate-600 to-blue-800", isDark: true };
  return { bg: "from-blue-900 via-slate-700 to-blue-950", isDark: true };
}

function AppRoutes() {
  const { user, loading, weather } = useApp();
  const weatherCode = weather?.current?.weather_code;
  const temp = weather?.current?.temperature_2m;
  const { bg: bgTheme, isDark } = getWeatherTheme(weatherCode, temp);

  if (loading) {
    return (
      <div className={`min-h-screen bg-gradient-to-br ${bgTheme} flex items-center justify-center transition-all duration-1000`}>
        <div className="text-center">
          <div className="text-6xl mb-4 animate-bounce">🌤️</div>
          <p className="text-white text-xl font-semibold">DayAdapt</p>
          <p className="text-blue-300 text-sm mt-2">Reading your environment...</p>
        </div>
      </div>
    );
  }

  return (
    <ThemeContext.Provider value={{ isDark }}>
      <div className={`min-h-screen bg-gradient-to-br ${bgTheme} transition-all duration-1000 relative`}>
        <WeatherBackground weatherCode={weatherCode} temp={temp} />
        <div className="relative z-10">
          {user && <Navbar />}
          <Routes>
            <Route path="/onboarding" element={!user ? <Onboarding /> : <Navigate to="/" />} />
            <Route path="/" element={user ? <Home /> : <Navigate to="/onboarding" />} />
            <Route path="/wardrobe" element={user ? <Wardrobe /> : <Navigate to="/onboarding" />} />
            <Route path="/profile" element={user ? <Profile /> : <Navigate to="/onboarding" />} />
          </Routes>
        </div>
      </div>
    </ThemeContext.Provider>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProvider>
  );
}
