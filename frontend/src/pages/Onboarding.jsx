import { useState } from "react";
import { useApp } from "../context/AppContext";
import { login, register } from "../services/auth";
import { updateProfile } from "../services/user";

const STEPS = ["welcome", "basic", "body", "preferences"];

export default function Onboarding() {
  const { fetchUserAndWardrobe } = useApp();
  const [mode, setMode] = useState("welcome"); // welcome | login | register
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    age: "",
    gender: "",
    height: "",
    weight: "",
    skinTone: "",
    stylePreference: [],
    comfortPriority: "comfort",
  });

  function updateForm(key, value) {
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
    if (!loginForm.email || !loginForm.password) return;
    setAuthLoading(true);
    setError("");
    try {
      await login({ email: loginForm.email, password: loginForm.password });
      await fetchUserAndWardrobe();
    } catch (err) {
      setError(err.message || "Invalid email or password.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleRegisterFinish() {
    setAuthLoading(true);
    setError("");
    try {
      // Step 1 — create account
      await register({
        email: form.email,
        password: form.password,
        name: form.name,
      });

      // Step 2 — save profile details
      await updateProfile({
        preferences: {
          default_activity: form.comfortPriority === "comfort" ? "casual" : "work",
          mood_selector_enabled: true,
          age: form.age,
          gender: form.gender,
          height: form.height,
          weight: form.weight,
          skinTone: form.skinTone,
          stylePreference: form.stylePreference,
          comfortPriority: form.comfortPriority,
        },
      });

      await fetchUserAndWardrobe();
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">

        {/* Progress bar — only during registration steps */}
        {mode === "register" && step > 0 && (
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

        {/* ─── WELCOME SCREEN ─── */}
        {mode === "welcome" && (
          <div className="text-center">
            <div className="text-7xl mb-6">🌤️</div>
            <h1 className="text-4xl font-bold text-white mb-3">DayAdapt</h1>
            <p className="text-blue-200 text-lg mb-10">
              Your weather-intelligent lifestyle companion.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => setMode("login")}
                className="w-full bg-white text-blue-900 font-bold py-4 rounded-2xl text-lg hover:bg-blue-50 transition-all"
              >
                Sign In
              </button>
              <button
                onClick={() => { setMode("register"); setStep(1); }}
                className="w-full bg-white/10 border border-white/20 text-white font-bold py-4 rounded-2xl text-lg hover:bg-white/20 transition-all"
              >
                Create Account
              </button>
            </div>
          </div>
        )}

        {/* ─── LOGIN SCREEN ─── */}
        {mode === "login" && (
          <div>
            <button
              onClick={() => { setMode("welcome"); setError(""); }}
              className="text-white/40 text-sm mb-6 flex items-center gap-1 hover:text-white/70 transition-all"
            >
              ← Back
            </button>
            <h2 className="text-2xl font-bold text-white mb-2">Welcome back</h2>
            <p className="text-blue-300 mb-6">Sign in to your account</p>
            <div className="space-y-4">
              <input
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/60"
                placeholder="Email"
                type="email"
                value={loginForm.email}
                onChange={(e) => setLoginForm((p) => ({ ...p, email: e.target.value }))}
              />
              <input
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/60"
                placeholder="Password"
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>
            {error && <p className="text-red-300 text-sm mt-3">{error}</p>}
            <button
              onClick={handleLogin}
              disabled={authLoading || !loginForm.email || !loginForm.password}
              className="w-full mt-6 bg-white text-blue-900 font-bold py-4 rounded-2xl disabled:opacity-40 transition-all"
            >
              {authLoading ? "Signing in..." : "Sign In"}
            </button>
            <p className="text-white/40 text-sm text-center mt-4">
              Don't have an account?{" "}
              <button
                onClick={() => { setMode("register"); setStep(1); setError(""); }}
                className="text-white underline"
              >
                Create one
              </button>
            </p>
          </div>
        )}

        {/* ─── REGISTER STEP 1 — Basic Info ─── */}
        {mode === "register" && step === 1 && (
          <div>
            <button
              onClick={() => { setMode("welcome"); setError(""); }}
              className="text-white/40 text-sm mb-6 flex items-center gap-1 hover:text-white/70 transition-all"
            >
              ← Back
            </button>
            <h2 className="text-2xl font-bold text-white mb-2">Create your account</h2>
            <p className="text-blue-300 mb-6">Let's get you set up</p>
            <div className="space-y-4">
              <input
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/60"
                placeholder="Your name"
                value={form.name}
                onChange={(e) => updateForm("name", e.target.value)}
              />
              <input
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/60"
                placeholder="Email"
                type="email"
                value={form.email}
                onChange={(e) => updateForm("email", e.target.value)}
              />
              <input
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/60"
                placeholder="Password"
                type="password"
                value={form.password}
                onChange={(e) => updateForm("password", e.target.value)}
              />
              <input
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/60"
                placeholder="Age"
                type="number"
                value={form.age}
                onChange={(e) => updateForm("age", e.target.value)}
              />
              <div className="grid grid-cols-3 gap-3">
                {["Male", "Female", "Other"].map((g) => (
                  <button
                    key={g}
                    onClick={() => updateForm("gender", g)}
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
            {error && <p className="text-red-300 text-sm mt-3">{error}</p>}
            <button
              onClick={() => setStep(2)}
              disabled={!form.name || !form.email || !form.password || !form.age || !form.gender}
              className="w-full mt-6 bg-white text-blue-900 font-bold py-4 rounded-2xl disabled:opacity-40 transition-all"
            >
              Continue
            </button>
            <p className="text-white/40 text-sm text-center mt-4">
              Already have an account?{" "}
              <button
                onClick={() => { setMode("login"); setError(""); }}
                className="text-white underline"
              >
                Sign in
              </button>
            </p>
          </div>
        )}

        {/* ─── REGISTER STEP 2 — Body ─── */}
        {mode === "register" && step === 2 && (
          <div>
            <button
              onClick={() => setStep(1)}
              className="text-white/40 text-sm mb-6 flex items-center gap-1 hover:text-white/70 transition-all"
            >
              ← Back
            </button>
            <h2 className="text-2xl font-bold text-white mb-2">Your profile</h2>
            <p className="text-blue-300 mb-6">Helps us suggest the right fit</p>
            <div className="space-y-4">
              <input
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/60"
                placeholder="Height (cm)"
                type="number"
                value={form.height}
                onChange={(e) => updateForm("height", e.target.value)}
              />
              <input
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/60"
                placeholder="Weight (kg)"
                type="number"
                value={form.weight}
                onChange={(e) => updateForm("weight", e.target.value)}
              />
              <div>
                <p className="text-white/60 text-sm mb-3">Skin tone</p>
                <div className="flex gap-4">
                  {[
                    { label: "Light", color: "#FDDBB4" },
                    { label: "Medium", color: "#D4A574" },
                    { label: "Tan", color: "#C68642" },
                    { label: "Deep", color: "#8D5524" },
                  ].map((tone) => (
                    <button
                      key={tone.label}
                      onClick={() => updateForm("skinTone", tone.label)}
                      className="flex flex-col items-center gap-1"
                    >
                      <div
                        className={`w-10 h-10 rounded-full border-4 transition-all ${
                          form.skinTone === tone.label
                            ? "border-white scale-110"
                            : "border-transparent"
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

        {/* ─── REGISTER STEP 3 — Style Preferences ─── */}
        {mode === "register" && step === 3 && (
          <div>
            <button
              onClick={() => setStep(2)}
              className="text-white/40 text-sm mb-6 flex items-center gap-1 hover:text-white/70 transition-all"
            >
              ← Back
            </button>
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
            <div className="mb-6">
              <p className="text-white/60 text-sm mb-3">What matters most to you?</p>
              <div className="grid grid-cols-2 gap-3">
                {["comfort", "style"].map((p) => (
                  <button
                    key={p}
                    onClick={() => updateForm("comfortPriority", p)}
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
            {error && <p className="text-red-300 text-sm mb-3">{error}</p>}
            <button
              onClick={handleRegisterFinish}
              disabled={authLoading || form.stylePreference.length === 0}
              className="w-full bg-white text-blue-900 font-bold py-4 rounded-2xl disabled:opacity-40 transition-all"
            >
              {authLoading ? "Setting up your account..." : "Let's Go 🚀"}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}