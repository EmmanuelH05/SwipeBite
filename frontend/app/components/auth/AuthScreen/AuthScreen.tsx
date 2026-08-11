"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Logo from "../../layout/Logo/Logo";
import Input from "../../ui/Input/Input";
import styles from "./AuthScreen.module.css";

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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Enter a valid email address";
}

function validatePassword(password: string, mode: AuthMode): string | undefined {
  if (!password) return "Password is required";
  if (mode === "signup") {
    if (password.length < 8) return "Password must be at least 8 characters";
    if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter";
    if (!/[0-9]/.test(password)) return "Password must contain at least one number";
  }
}

function validateName(name: string): string | undefined {
  if (!name.trim()) return "Name is required";
  if (name.trim().length < 2) return "Name must be at least 2 characters";
}

const EmailIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);

const PersonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
);

export default function AuthScreen({
  mode, email, password, name, loading, error,
  onEmailChange, onPasswordChange, onNameChange, onSubmit, onSwitchMode,
}: AuthScreenProps) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const emailError    = touched.email    ? validateEmail(email)           : undefined;
  const passwordError = touched.password ? validatePassword(password, mode) : undefined;
  const nameError     = mode === "signup" && touched.name ? validateName(name) : undefined;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ email: true, password: true, name: true });
    if (validateEmail(email) || validatePassword(password, mode) || (mode === "signup" && validateName(name))) return;
    onSubmit(e);
  };

  return (
    <div className={styles.page}>
      <div className={styles.glowLeft} />
      <div className={styles.glowRight} />
      <div className={styles.glowCenter} />

      <motion.main
        className={styles.container}
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className={styles.logoBlock}>
          <Logo size="auth" animate />
          <p className={styles.tagline}>
            {mode === "signup" ? "Create an account to start discovering" : "Welcome back"}
          </p>
        </div>

        <div className={styles.card}>
          <form onSubmit={handleSubmit} className={styles.form}>
            <Input
              type="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              placeholder="Email address"
              aria-label="Email address"
              disabled={loading}
              autoComplete="email"
              error={emailError}
              leftIcon={<EmailIcon />}
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
                  aria-label="Your name"
                  disabled={loading}
                  autoComplete="name"
                  error={nameError}
                  leftIcon={<PersonIcon />}
                />
              </motion.div>
            )}

            <Input
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              placeholder={mode === "signup" ? "Password (min 8 chars, A-Z, 0-9)" : "Password"}
              aria-label="Password"
              disabled={loading}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              error={passwordError}
              leftIcon={<LockIcon />}
            />

            <button type="submit" disabled={loading} className={styles.submitBtn}>
              {loading ? (
                <span className={styles.loadingInner}>
                  <svg className={styles.spinner} viewBox="0 0 24 24" fill="none">
                    <circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {mode === "signup" ? "Creating account..." : "Signing in..."}
                </span>
              ) : (
                mode === "signup" ? "Create account" : "Sign in"
              )}
            </button>
          </form>

          {error && (
            <motion.div
              className={styles.errorBox}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <p className={styles.errorText}>{error}</p>
            </motion.div>
          )}

          <div className={styles.switchRow}>
            <button
              type="button"
              className={styles.switchBtn}
              onClick={() => { setTouched({}); onSwitchMode(); }}
            >
              {mode === "signup"
                ? <>Already have an account? <span>Sign in</span></>
                : <>New here? <span>Create an account</span></>}
            </button>
          </div>
        </div>

        <p className={styles.footer}>AI-Powered Food Discovery</p>
      </motion.main>
    </div>
  );
}
