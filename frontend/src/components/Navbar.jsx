import { Link, useLocation } from "react-router-dom";
import { Home, Shirt, User } from "lucide-react";
import { useTheme } from "../App";

export default function Navbar() {
  const location = useLocation();
  const { isDark } = useTheme();

  const base = isDark ? "bg-white/10 border-white/20" : "bg-black/10 border-black/20";
  const active = isDark ? "text-white" : "text-gray-900";
  const inactive = isDark ? "text-white/40" : "text-gray-400";

  return (
    <nav className={`fixed bottom-0 left-0 right-0 ${base} backdrop-blur-md border-t z-50`}>
      <div className="flex justify-around items-center py-3 px-6 max-w-md mx-auto">
        <Link
          to="/"
          className={`flex flex-col items-center gap-1 transition-all ${
            location.pathname === "/" ? active : inactive
          }`}
        >
          <Home size={22} />
          <span className="text-xs">Home</span>
        </Link>
        <Link
          to="/wardrobe"
          className={`flex flex-col items-center gap-1 transition-all ${
            location.pathname === "/wardrobe" ? active : inactive
          }`}
        >
          <Shirt size={22} />
          <span className="text-xs">Wardrobe</span>
        </Link>
        <Link
          to="/profile"
          className={`flex flex-col items-center gap-1 transition-all ${
            location.pathname === "/profile" ? active : inactive
          }`}
        >
          <User size={22} />
          <span className="text-xs">Profile</span>
        </Link>
      </div>
    </nav>
  );
}
