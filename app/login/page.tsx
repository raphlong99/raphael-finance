"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) { setState("error"); setMsg(error.message); } else setState("sent");
  }

  return (
    <main className="wrap" style={{ maxWidth: 420, paddingTop: "12vh" }}>
      <div>
        <div className="eyebrow">Buckets</div>
        <h1>Sign in</h1>
        <p className="muted">We'll email you a link. Open it on this device to sign in. New here? The same link creates your account.</p>
      </div>
      <form className="panel" onSubmit={send} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <button className="btn" type="submit" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Email me a link"}</button>
        {state === "sent" && <div className="notice">Link sent to {email}. Check your inbox.</div>}
        {state === "error" && <div className="notice" style={{ color: "var(--bad)" }}>Couldn't send the link: {msg}</div>}
      </form>
    </main>
  );
}
