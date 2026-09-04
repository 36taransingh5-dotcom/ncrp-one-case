"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function AuthForm({ configured }: { configured: boolean }) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!configured) {
      setMessage(
        "Supabase is not configured in this environment. Use the local demo entry instead.",
      );
      return;
    }
    setBusy(true);
    setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback?next=/cases`,
        data: { display_name: displayName || email.split("@")[0] },
      },
    });
    setBusy(false);
    setMessage(
      error
        ? "We could not send the secure sign-in link. Check the address and try again."
        : "Check your email for a secure sign-in link.",
    );
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        Your name
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={120}
          autoComplete="name"
        />
      </label>
      <label>
        Email address
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
        />
      </label>
      {message && (
        <div
          className={message.startsWith("Check") ? "success" : "error"}
          role="status"
        >
          {message}
        </div>
      )}
      <button className="btn" disabled={busy}>
        {busy ? "Sending secure link…" : "Continue with email"}
      </button>
    </form>
  );
}
