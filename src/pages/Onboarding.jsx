import { useState } from "react";
import { useApp } from "../context/AppContext";
import { db } from "../services/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

const STEPS = ["welcome", "basic", "body", "preferences"];

export default function Onboarding() {
  const { saveUser, loadWardrobe } = useApp();
  const [step, setStep] = useState(0);
  const [loginName, setLoginName] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    age: "",
    gender: "",
    height: "",
    weight: "",
    skinTone: "",
    stylePreference: [],
    comfortPriority: "comfort",
  });

  function update(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleStyle(style) {
    setForm((prev) => ({
      ...prev,
      stylePreference: prev.stylePreference.includes(style)
        ? prev.stylePreference.filter((s) => s !== style)
        : [...prev.stylePreference, style],
    }));
  }

  async function handleLogin() {
    if (!loginName.trim()) return;
    setLoginLoading(true);
    setLoginError("");
    try {
      const q = query(collection(db, "users"), where("name", "==", loginName.trim()));
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        setLoginError("No user found with that name. Please create an account.");
      } else {
        const userData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        localStorage.setItem("dayadapt_user", JSON.stringify(userData));
        await loadWardrobe(userData.id);
        window.location.reload();
      }
    } catch (err) {
      setLoginError("Something went wrong. Try again.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function finish() {
    await saveUser({ ...form, preferences: { likedOutfits: [], dislikedOutfits: [] } });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">

        {/* Progress — only show after welcome */}
        {step > 0 && (
          <div className="flex gap-2 mb-8">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-all ${
                  i <= step ? "bg-white" : "bg-white/20"
                }`}
              />
            ))}
          </div>
        )}

        {/* Step 0 — Welcome + Login */}
        {step === 0 && (
          <div className="text-center">
            <div className="text-7xl mb-6">🌤️</div>
            <h1 className="text-4xl font-bold text-white mb-3">DayAdapt</h1>
            <p className="text-blue-200 text-lg mb-8">
              Your weather-intelligent lifestyle companion.
            </p>

            {/* Login Section */}
            <div className="bg-white/10 border border-white/20 rounded-2xl p-5 mb-4 text-left">
              <p className="text-white font-medium mb-3">Already have an account?</p>
              <input
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/60 mb-3"
                placeholder="Enter your name"
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
              {loginError && (
                <p className="text-red-300 text-sm mb-3">{loginError}</p>
              )}
              <button
                onClick={handleLogin}
                disabled={loginLoading || !loginName.trim()}
                className="w-full bg-white text-blue-900 font-bold py-3 rounded-xl disabled:opacity-40 transition-all"
              >
                {loginLoading ? "Looking you up..." : "Sign In"}
              </button>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-white/20" />
              <span className="text-white/40 text-sm">or</span>
              <div className="flex-1 h-px bg-white/20" />
            </div>

            <button
              onClick={() => setStep(1)}
              className="w-full bg-white/10 border border-white/20 text-white font-bold py-4 rounded-2xl text-lg hover:bg-white/20 transition-all"
            >
              Create New Account
            </button>
          </div>
        )}

        {/* Step 1 — Basic Info */}
        {step === 1 && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Tell us about you</h2>
            <p className="text-blue-300 mb-6">We'll personalize your experience</p>
            <div className="space-y-4">
              <input
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/60"
                placeholder="Your name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
              />
              <input
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/60"
                placeholder="Age"
                type="number"
                value={form.age}
                onChange={(e) => update("age", e.target.value)}
              />
              <div className="grid grid-cols-3 gap-3">
                {["Male", "Female", "Other"].map((g) => (
                  <button
                    key={g}
                    onClick={() => update("gender", g)}
                    className={`py-3 rounded-xl border transition-all text-sm font-medium ${
                      form.gender === g
                        ? "bg-white text-blue-900 border-white"
                        : "bg-white/10 text-white border-white/20"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => setStep(2)}
              disabled={!form.name || !form.age || !form.gender}
              className="w-full mt-6 bg-white text-blue-900 font-bold py-4 rounded-2xl disabled:opacity-40 transition-all"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 2 — Body */}
        {step === 2 && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Your profile</h2>
            <p className="text-blue-300 mb-6">Helps us suggest the right fit</p>
            <div className="space-y-4">
              <input
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/60"
                placeholder="Height (cm)"
                type="number"
                value={form.height}
                onChange={(e) => update("height", e.target.value)}
              />
              <input
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/60"
                placeholder="Weight (kg)"
                type="number"
                value={form.weight}
                onChange={(e) => update("weight", e.target.value)}
              />
              <div>
                <p className="text-white/60 text-sm mb-2">Skin tone</p>
                <div className="flex gap-3">
                  {[
                    { label: "Light", color: "#FDDBB4" },
                    { label: "Medium", color: "#D4A574" },
                    { label: "Tan", color: "#C68642" },
                    { label: "Deep", color: "#8D5524" },
                  ].map((tone) => (
                    <button
                      key={tone.label}
                      onClick={() => update("skinTone", tone.label)}
                    >
                      <div
                        className={`w-10 h-10 rounded-full border-4 transition-all ${
                          form.skinTone === tone.label ? "border-white scale-110" : "border-transparent"
                        }`}
                        style={{ backgroundColor: tone.color }}
                      />
                      <span className="text-white/60 text-xs">{tone.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={() => setStep(3)}
              className="w-full mt-6 bg-white text-blue-900 font-bold py-4 rounded-2xl transition-all"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 3 — Preferences */}
        {step === 3 && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Your style</h2>
            <p className="text-blue-300 mb-6">Select all that apply</p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {["Casual", "Formal", "Sporty", "Outdoor", "Minimalist", "Streetwear"].map((style) => (
                <button
                  key={style}
                  onClick={() => toggleStyle(style)}
                  className={`py-3 rounded-xl border transition-all text-sm font-medium ${
                    form.stylePreference.includes(style)
                      ? "bg-white text-blue-900 border-white"
                      : "bg-white/10 text-white border-white/20"
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
            <div>
              <p className="text-white/60 text-sm mb-2">What matters most?</p>
              <div className="grid grid-cols-2 gap-3">
                {["comfort", "style"].map((p) => (
                  <button
                    key={p}
                    onClick={() => update("comfortPriority", p)}
                    className={`py-3 rounded-xl border transition-all text-sm font-medium capitalize ${
                      form.comfortPriority === p
                        ? "bg-white text-blue-900 border-white"
                        : "bg-white/10 text-white border-white/20"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={finish}
              disabled={form.stylePreference.length === 0}
              className="w-full mt-6 bg-white text-blue-900 font-bold py-4 rounded-2xl disabled:opacity-40 transition-all"
            >
              Let's Go 🚀
            </button>
          </div>
        )}
      </div>
    </div>
  );
}