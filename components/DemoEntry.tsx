"use client";
import { useState } from "react";

export function DemoEntry({
  role,
  label,
  variant,
  demo = "golden",
}: {
  role: "citizen" | "operator";
  label: string;
  variant?: "primary" | "secondary";
  demo?: "golden" | "showcase";
}) {
  const [loading, setLoading] = useState(false);
  const tone = variant ?? (role === "operator" ? "secondary" : "primary");
  const enter = async () => {
    setLoading(true);
    const response = await fetch("/api/auth/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, demo }),
    });
    const data = await response.json();
    if (data.redirect) location.href = data.redirect;
    else setLoading(false);
  };
  return (
    <button
      className={tone === "secondary" ? "btn secondary" : "btn"}
      onClick={enter}
      disabled={loading}
    >
      {loading ? "Opening demo…" : label}
    </button>
  );
}
