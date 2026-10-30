"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUiText } from "@/i18n/ui-client";
export function LoginForm() {
  const t = useUiText();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(t(data.error?.message ?? "Prijava nije uspela"));
      router.push("/operations");
      router.refresh();
    } catch (cause) {
      setError(
        t(cause instanceof Error ? cause.message : "Prijava nije uspela"),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="login-form">
      <label>
        {t("Email")}{" "}
        <input
          type="email"
          name="email"
          defaultValue="owner@dunav.demo.invalid"
          required
          autoComplete="username"
        />
      </label>
      <label>
        {t("Lozinka")}{" "}
        <input
          type="password"
          name="password"
          defaultValue="Demo1234!"
          required
          autoComplete="current-password"
        />
      </label>
      {error && (
        <div role="alert" className="form-error">
          {error}
        </div>
      )}
      <button className="button primary" disabled={busy}>
        {t(busy ? "Prijavljivanje…" : "Prijavi se")}
      </button>
    </form>
  );
}
