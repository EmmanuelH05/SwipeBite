"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Logo from "../layout/Logo";
import Button from "../ui/Button";
import Input from "../ui/Input";

type AuthMode = "signup" | "login";

type AuthScreenProps = {
  mode: AuthMode;
  email: string;
  password: string;
  name: string;
  loading: boolean;
  error: string | null;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onSwitchMode: () => void;
};

function validateEmail(email: string): string | undefined {
  if (!email.trim()) return "Email is required";
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email.trim())) return "Enter a valid email address";
  return undefined;
}

function validatePassword(password: string, mode: AuthMode): string | undefined {
  if (!password) return "Password is required";
  if (mode === "signup" && password.length < 6) return "Password must be at least 6 characters";
  return undefined;
}

function validateName(name: string): string | undefined {
  if (!name.trim()) return "Name is required";
  if (name.trim().length < 2) return "Name must be at least 2 characters";
  return undefined;
}

export default function AuthScreen({
  mode,
  email,
  password,
  name,
  loading,
  error,
  onEmailChange,
  onPasswordChange,
  onNameChange,
  onSubmit,
  onSwitchMode,
}: AuthScreenProps) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const emailError = touched.email ? validateEmail(email) : undefined;
  const passwordError = touched.password ? validatePassword(password, mode) : undefined;
  const nameError = mode === "signup" && touched.name ? validateName(name) : undefined;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ email: true, password: true, name: true });

    const hasEmailErr = validateEmail(email);
    const hasPassErr = validatePassword(password, mode);
    const hasNameErr = mode === "signup" ? validateName(name) : undefined;

    if (hasEmailErr || hasPassErr || hasNameErr) return;
    onSubmit(e);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#08080d] p-6">
      {/* Ambient glow blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-indigo-600/8 blur-3xl" />
        <div className="absolute -right-24 -bottom-24 h-96 w-96 rounded-full bg-cyan-500/6 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/5 blur-3xl" />
      </div>

      <motion.main
        className="relative w-full max-w-sm"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="rounded-2xl border border-[#2a2a3a] bg-[#0e0e14]/95 backdrop-blur-sm p-8 shadow-[0_0_100px_rgba(0,0,0,0.6)]">
          <div className="mb-2 flex justify-center">
            <Logo size="auth" animate />
          </div>
          <p className="mb-8 text-center text-sm text-[#55556a]">
            {mode === "signup" ? "Create an account to start discovering" : "Welcome back"}
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <Input
              type="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              placeholder="Email address"
              disabled={loading}
              autoComplete="email"
              error={emailError}
            />
            {mode === "signup" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => onNameChange(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                  placeholder="Your name"
                  disabled={loading}
                  autoComplete="name"
                  error={nameError}
                />
              </motion.div>
            )}
            <Input
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              placeholder={mode === "signup" ? "Password (min 6 characters)" : "Password"}
              disabled={loading}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              error={passwordError}
            />
            <Button
              type="submit"
              variant="primary"
              disabled={loading}
              className="mt-1 w-full py-3"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {mode === "signup" ? "Creating account..." : "Signing in..."}
                </span>
              ) : (
                mode === "signup" ? "Create account" : "Sign in"
              )}
            </Button>
          </form>

          {error && (
            <motion.div
              className="mt-4 rounded-xl border border-[#f87171]/20 bg-[#f87171]/5 p-3"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <p className="text-sm text-[#f87171]">{error}</p>
            </motion.div>
          )}

          <div className="mt-6 text-center">
            <button
              type="button"
              className="text-sm text-[#55556a] transition-colors hover:text-indigo-400"
              onClick={() => {
                setTouched({});
                onSwitchMode();
              }}
            >
              {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Sign up"}
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-[10px] text-[#33334a] tracking-widest uppercase">
          AI-Powered Food Discovery
        </p>
      </motion.main>
    </div>
  );
}
