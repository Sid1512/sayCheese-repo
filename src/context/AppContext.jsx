import { createContext, useContext, useState, useEffect } from "react";
import { db } from "../services/firebase";
import { doc, setDoc, collection, getDocs } from "firebase/firestore";
import { getWeather, getUserLocation, reverseGeocode } from "../services/weather";

const AppContext = createContext();

export function AppProvider({ children }) {
    const [user, setUser] = useState(null);
    const [weather, setWeather] = useState(null);
    const [wardrobe, setWardrobe] = useState([]);
    const [loading, setLoading] = useState(true);
    const [location, setLocation] = useState(null);
    const [locationName, setLocationName] = useState(null);

    // Load user from localStorage
    useEffect(() => {
        const savedUser = localStorage.getItem("dayadapt_user");
        if (savedUser) {
            const parsed = JSON.parse(savedUser);
            setUser(parsed);
            loadWardrobe(parsed.id);
        }
        fetchWeather();
    }, []);

    async function fetchWeather() {
        try {
            const loc = await getUserLocation();
            setLocation(loc);
            const [weatherData, name] = await Promise.all([
                getWeather(loc.lat, loc.lon),
                reverseGeocode(loc.lat, loc.lon),
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
        } finally {
            setLoading(false);
        }
    }

    async function loadWardrobe(userId) {
        try {
            const snapshot = await getDocs(collection(db, "users", userId, "wardrobe"));
            const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            setWardrobe(items);
        } catch (err) {
            console.error("Error loading wardrobe:", err);
        }
    }

    async function saveUser(userData) {
        const userId = userData.id || `user_${Date.now()}`;
        const newUser = { ...userData, id: userId };
        await setDoc(doc(db, "users", userId), newUser);
        localStorage.setItem("dayadapt_user", JSON.stringify(newUser));
        setUser(newUser);
        return newUser;
    }

    async function updateUserPrefs(prefs) {
        if (!user) return;
        const updated = { ...user, preferences: { ...user.preferences, ...prefs } };
        await setDoc(doc(db, "users", user.id), updated);
        localStorage.setItem("dayadapt_user", JSON.stringify(updated));
        setUser(updated);
    }

    async function addWardrobeItem(item) {
        if (!user) return;
        const ref = doc(collection(db, "users", user.id, "wardrobe"));
        const newItem = { ...item, id: ref.id, addedAt: new Date().toISOString(), wornCount: 0 };
        await setDoc(ref, newItem);
        setWardrobe((prev) => [...prev, newItem]);
        return newItem;
    }

    async function incrementWornCount(itemId) {
        if (!user) return;
        const item = wardrobe.find((i) => i.id === itemId);
        if (!item) return;
        const updated = { ...item, wornCount: (item.wornCount || 0) + 1, lastWorn: new Date().toISOString() };
        await setDoc(doc(db, "users", user.id, "wardrobe", itemId), updated);
        setWardrobe((prev) => prev.map((i) => (i.id === itemId ? updated : i)));
    }

    return (
        <AppContext.Provider
            value={{
                user,
                weather,
                wardrobe,
                loading,
                location,
                locationName,
                saveUser,
                updateUserPrefs,
                addWardrobeItem,
                incrementWornCount,
                loadWardrobe,
            }}
        >
            {children}
        </AppContext.Provider>
    );
}

export function useApp() {
    return useContext(AppContext);
}