import { useState } from "react";
import { useApp } from "../context/AppContext";
import { useTheme } from "../App";
import { login, register } from "../services/auth";
import { updateProfile } from "../services/user";

const STEPS = ["welcome", "basic", "body", "preferences"];

export default function Onboarding() {
  const { fetchUserAndWardrobe } = useApp();
  const { isDark } = useTheme();
  const [mode, setMode] = useState("welcome"); // welcome | login | register
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [loginTouched, setLoginTouched] = useState({ email: false, password: false });
  const [touched, setTouched] = useState({});
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
  });

  // ── Theme tokens ──
  const text        = isDark ? "text-white"            : "text-gray-900";
  const textMuted   = isDark ? "text-white/70"         : "text-gray-600";
  const textFaint   = isDark ? "text-white/40"         : "text-gray-400";
  const textHover   = isDark ? "hover:text-white/70"   : "hover:text-gray-700";
  const subheading  = isDark ? "text-blue-200"         : "text-blue-700";
  const inputBg     = isDark
    ? "bg-white/10 border-white/20 text-white placeholder-white/40 focus:border-white/60"
    : "bg-black/5 border-black/20 text-gray-900 placeholder-gray-400 focus:border-black/50";
  const btnOutline  = isDark
    ? "bg-white/10 border border-white/20 text-white hover:bg-white/20"
    : "bg-black/5 border border-black/20 text-gray-900 hover:bg-black/10";
  const btnPrimary  = "bg-white text-blue-900 hover:bg-blue-50";
  const linkText    = isDark ? "text-white"            : "text-blue-700";
  const progressOn  = isDark ? "bg-white"              : "bg-gray-800";
  const progressOff = isDark ? "bg-white/20"           : "bg-black/15";
  const pillActive  = "bg-white text-blue-900 border-white";
  const pillInactive= isDark
    ? "bg-white/10 text-white border-white/20"
    : "bg-black/5 text-gray-900 border-black/20";
  const skinLabel   = isDark ? "text-white/60"         : "text-gray-500";
  const skinBorder  = isDark ? "border-white"          : "border-gray-800";
  const errorText   = "text-red-500";

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

  // ── Validation helpers ──
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  function isValidName(name) {
    return name.trim().length >= 2 && /^[a-zA-Z\s'-]+$/.test(name.trim());
  }

  function isValidPassword(password) {
    return password.length >= 8;
  }

  function isValidAge(age) {
    const n = Number(age);
    return age !== "" && Number.isInteger(n) && n >= 13 && n <= 120;
  }

  function loginErrors() {
    const errs = {};
    if (loginTouched.email && !loginForm.email) errs.email = "Email is required.";
    else if (loginTouched.email && !isValidEmail(loginForm.email)) errs.email = "Enter a valid email address.";
    if (loginTouched.password && !loginForm.password) errs.password = "Password is required.";
    return errs;
  }

  function step1Errors() {
    const errs = {};
    if (touched.name && !form.name) errs.name = "Name is required.";
    else if (touched.name && !isValidName(form.name)) errs.name = "Name can only contain letters, spaces, hyphens, and apostrophes.";
    if (touched.email && !form.email) errs.email = "Email is required.";
    else if (touched.email && !isValidEmail(form.email)) errs.email = "Enter a valid email address.";
    if (touched.password && !form.password) errs.password = "Password is required.";
    else if (touched.password && !isValidPassword(form.password)) errs.password = "Password must be at least 8 characters.";
    if (touched.age && !form.age) errs.age = "Age is required.";
    else if (touched.age && !isValidAge(form.age)) errs.age = "Enter a valid age between 13 and 120.";
    if (touched.gender && !form.gender) errs.gender = "Please select a gender.";
    return errs;
  }

  const isStep1Valid =
    isValidName(form.name) &&
    isValidEmail(form.email) &&
    isValidPassword(form.password) &&
    isValidAge(form.age) &&
    form.gender;

  function touchAllStep1() {
    setTouched({ name: true, email: true, password: true, age: true, gender: true });
  }

  function touchAllLogin() {
    setLoginTouched({ email: true, password: true });
  }

  async function handleLogin() {
    touchAllLogin();
    if (!isValidEmail(loginForm.email) || !loginForm.password) return;
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
      await register({
        email: form.email,
        password: form.password,
        name: form.name,
      });
      await updateProfile({
        preferences: {
          age: form.age,
          gender: form.gender,
          height: form.height,
          weight: form.weight,
          skinTone: form.skinTone,
          stylePreference: form.stylePreference,
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
      <div className={`w-full max-w-md rounded-3xl p-8 backdrop-blur-md ${isDark ? "bg-white/5 border border-white/10" : "bg-white/70 border border-black/10"} shadow-2xl`}>

        {/* Progress bar */}
        {mode === "register" && step > 0 && (
          <div className="flex gap-2 mb-8">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-all ${
                  i <= step ? progressOn : progressOff
                }`}
              />
            ))}
          </div>
        )}

        {/* ─── WELCOME SCREEN ─── */}
        {mode === "welcome" && (
          <div className="text-center">
            <div className="text-7xl mb-6">🌤️</div>
            <h1 className={`text-4xl font-bold ${text} mb-3`}>DayAdapt</h1>
            <p className={`${subheading} text-lg mb-10`}>
              Your weather-intelligent lifestyle companion.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => setMode("login")}
                className={`w-full ${btnPrimary} font-bold py-4 rounded-2xl text-lg transition-all`}
              >
                Sign In
              </button>
              <button
                onClick={() => { setMode("register"); setStep(1); }}
                className={`w-full ${btnOutline} font-bold py-4 rounded-2xl text-lg transition-all`}
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
              className={`${textFaint} ${textHover} text-sm mb-6 flex items-center gap-1 transition-all`}
            >
              ← Back
            </button>
            <h2 className={`text-2xl font-bold ${text} mb-2`}>Welcome back</h2>
            <p className={`${subheading} mb-6`}>Sign in to your account</p>
            {(() => { const errs = loginErrors(); return (
            <div className="space-y-4">
              <div>
                <input
                  className={`w-full border rounded-xl px-4 py-3 focus:outline-none transition-all ${errs.email ? "border-red-400" : inputBg}`}
                  placeholder="Email"
                  type="email"
                  value={loginForm.email}
                  onChange={(e) => setLoginForm((p) => ({ ...p, email: e.target.value }))}
                  onBlur={() => setLoginTouched((p) => ({ ...p, email: true }))}
                />
                {errs.email && <p className={`${errorText} text-xs mt-1 ml-1`}>{errs.email}</p>}
              </div>
              <div>
                <input
                  className={`w-full border rounded-xl px-4 py-3 focus:outline-none transition-all ${errs.password ? "border-red-400" : inputBg}`}
                  placeholder="Password"
                  type="password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))}
                  onBlur={() => setLoginTouched((p) => ({ ...p, password: true }))}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
                {errs.password && <p className={`${errorText} text-xs mt-1 ml-1`}>{errs.password}</p>}
              </div>
            </div>
            ); })()}
            {error && <p className={`${errorText} text-sm mt-3`}>{error}</p>}
            <button
              onClick={handleLogin}
              disabled={authLoading}
              className={`w-full mt-6 ${btnPrimary} font-bold py-4 rounded-2xl disabled:opacity-40 transition-all`}
            >
              {authLoading ? "Signing in..." : "Sign In"}
            </button>
            <p className={`${textFaint} text-sm text-center mt-4`}>
              Don't have an account?{" "}
              <button
                onClick={() => { setMode("register"); setStep(1); setError(""); }}
                className={`${linkText} underline`}
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
              className={`${textFaint} ${textHover} text-sm mb-6 flex items-center gap-1 transition-all`}
            >
              ← Back
            </button>
            <h2 className={`text-2xl font-bold ${text} mb-2`}>Create your account</h2>
            <p className={`${subheading} mb-6`}>Let's get you set up</p>
            {(() => { const errs = step1Errors(); return (
            <div className="space-y-4">
              <div>
                <input
                  className={`w-full border rounded-xl px-4 py-3 focus:outline-none transition-all ${errs.name ? "border-red-400" : inputBg}`}
                  placeholder="Your name"
                  value={form.name}
                  onChange={(e) => updateForm("name", e.target.value)}
                  onBlur={() => setTouched((p) => ({ ...p, name: true }))}
                />
                {errs.name && <p className={`${errorText} text-xs mt-1 ml-1`}>{errs.name}</p>}
              </div>
              <div>
                <input
                  className={`w-full border rounded-xl px-4 py-3 focus:outline-none transition-all ${errs.email ? "border-red-400" : inputBg}`}
                  placeholder="Email"
                  type="email"
                  value={form.email}
                  onChange={(e) => updateForm("email", e.target.value)}
                  onBlur={() => setTouched((p) => ({ ...p, email: true }))}
                />
                {errs.email && <p className={`${errorText} text-xs mt-1 ml-1`}>{errs.email}</p>}
              </div>
              <div>
                <input
                  className={`w-full border rounded-xl px-4 py-3 focus:outline-none transition-all ${errs.password ? "border-red-400" : inputBg}`}
                  placeholder="Password (min. 8 characters)"
                  type="password"
                  value={form.password}
                  onChange={(e) => updateForm("password", e.target.value)}
                  onBlur={() => setTouched((p) => ({ ...p, password: true }))}
                />
                {errs.password && <p className={`${errorText} text-xs mt-1 ml-1`}>{errs.password}</p>}
              </div>
              <div>
                <input
                  className={`w-full border rounded-xl px-4 py-3 focus:outline-none transition-all ${errs.age ? "border-red-400" : inputBg}`}
                  placeholder="Age"
                  type="number"
                  value={form.age}
                  onChange={(e) => updateForm("age", e.target.value)}
                  onBlur={() => setTouched((p) => ({ ...p, age: true }))}
                />
                {errs.age && <p className={`${errorText} text-xs mt-1 ml-1`}>{errs.age}</p>}
              </div>
              <div>
                <div className="grid grid-cols-3 gap-3">
                  {["Male", "Female", "Other"].map((g) => (
                    <button
                      key={g}
                      onClick={() => { updateForm("gender", g); setTouched((p) => ({ ...p, gender: true })); }}
                      className={`py-3 rounded-xl border transition-all text-sm font-medium ${
                        form.gender === g ? pillActive : pillInactive
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
                {errs.gender && <p className={`${errorText} text-xs mt-1 ml-1`}>{errs.gender}</p>}
              </div>
            </div>
            ); })()}
            {error && <p className={`${errorText} text-sm mt-3`}>{error}</p>}
            <button
              onClick={() => {
                touchAllStep1();
                if (isStep1Valid) setStep(2);
              }}
              className={`w-full mt-6 ${btnPrimary} font-bold py-4 rounded-2xl disabled:opacity-40 transition-all`}
            >
              Continue
            </button>
            <p className={`${textFaint} text-sm text-center mt-4`}>
              Already have an account?{" "}
              <button
                onClick={() => { setMode("login"); setError(""); }}
                className={`${linkText} underline`}
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
              className={`${textFaint} ${textHover} text-sm mb-6 flex items-center gap-1 transition-all`}
            >
              ← Back
            </button>
            <h2 className={`text-2xl font-bold ${text} mb-2`}>Your profile</h2>
            <p className={`${subheading} mb-6`}>Helps us suggest the right fit</p>
            <div className="space-y-4">
              <input
                className={`w-full border rounded-xl px-4 py-3 focus:outline-none transition-all ${inputBg}`}
                placeholder="Height (cm)"
                type="number"
                value={form.height}
                onChange={(e) => updateForm("height", e.target.value)}
              />
              <input
                className={`w-full border rounded-xl px-4 py-3 focus:outline-none transition-all ${inputBg}`}
                placeholder="Weight (kg)"
                type="number"
                value={form.weight}
                onChange={(e) => updateForm("weight", e.target.value)}
              />
              <div>
                <p className={`${skinLabel} text-sm mb-3`}>Skin tone</p>
                <div className="flex gap-4">
                  {[
                    { label: "Light",  color: "#FDDBB4" },
                    { label: "Medium", color: "#D4A574" },
                    { label: "Tan",    color: "#C68642" },
                    { label: "Deep",   color: "#8D5524" },
                  ].map((tone) => (
                    <button
                      key={tone.label}
                      onClick={() => updateForm("skinTone", tone.label)}
                      className="flex flex-col items-center gap-1"
                    >
                      <div
                        className={`w-10 h-10 rounded-full border-4 transition-all ${
                          form.skinTone === tone.label
                            ? `${skinBorder} scale-110`
                            : "border-transparent"
                        }`}
                        style={{ backgroundColor: tone.color }}
                      />
                      <span className={`${skinLabel} text-xs`}>{tone.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={() => setStep(3)}
              className={`w-full mt-6 ${btnPrimary} font-bold py-4 rounded-2xl transition-all`}
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
              className={`${textFaint} ${textHover} text-sm mb-6 flex items-center gap-1 transition-all`}
            >
              ← Back
            </button>
            <h2 className={`text-2xl font-bold ${text} mb-2`}>Your style</h2>
            <p className={`${subheading} mb-6`}>Select all that apply</p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {["Casual", "Formal", "Sporty", "Outdoor", "Minimalist", "Streetwear"].map((style) => (
                <button
                  key={style}
                  onClick={() => toggleStyle(style)}
                  className={`py-3 rounded-xl border transition-all text-sm font-medium ${
                    form.stylePreference.includes(style) ? pillActive : pillInactive
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
            {error && <p className={`${errorText} text-sm mb-3`}>{error}</p>}
            <button
              onClick={handleRegisterFinish}
              disabled={authLoading || form.stylePreference.length === 0}
              className={`w-full ${btnPrimary} font-bold py-4 rounded-2xl disabled:opacity-40 transition-all`}
            >
              {authLoading ? "Setting up your account..." : "Let's Go 🚀"}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}