"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createConnectorLink, revokeConnector } from "@/app/setup/connect-actions";

type Link = { id: string; name: string; created_at: string; last_used_at: string | null };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-SG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "Never");

export default function ConnectAI({ links }: { links: Link[] }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("Claude");
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const make = () => start(async () => {
    const r = await createConnectorLink(name);
    if ("error" in r && r.error) setErr(r.error); else { setErr(""); setUrl(r.url!); router.refresh(); }
  });
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { (document.getElementById("mcp-url") as HTMLInputElement | null)?.select(); }
  };

  return (
    <section className="panel" id="connect">
      <h2>Connect Claude</h2>
      <p className="muted small" style={{ maxWidth: "64ch" }}>
        Give Claude its own link to your plan so you can say things like “UOB is 5,200 now” or “log 6,400 for November” in any chat.
        In Claude, open Settings → Connectors → Add custom connector, and paste the link.
      </p>
      {!url ? (
        <div className="row" style={{ marginTop: 10 }}>
          <label className="sr" htmlFor="mcp-name">Name for this link</label>
          <input id="mcp-name" className="input" value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 220 }} />
          <button className="btn" type="button" onClick={make} disabled={pending}>{pending ? "Creating…" : "Create connector link"}</button>
        </div>
      ) : (
        <div className="notice" style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <b>Your connector link. Copy it now; it won't be shown again.</b>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input id="mcp-url" className="input mono" readOnly value={url} onFocus={(e) => e.target.select()} />
            <button className="btn sm" type="button" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
          </div>
          <span className="small muted">Anyone with this link can read and update your plan. Keep it private, and revoke it below if it leaks.</span>
          <div><button className="btn ghost sm" type="button" onClick={() => setUrl("")}>Done</button></div>
        </div>
      )}
      {err && <div className="small" style={{ color: "var(--bad)", marginTop: 8 }}>{err}</div>}
      {links.length > 0 && (
        <ul className="accts" style={{ marginTop: 12 }}>
          {links.map((l) => (
            <li key={l.id} className="acct">
              <div className="acct-main"><b>{l.name}</b><span className="small muted">Created {when(l.created_at)} · last used {when(l.last_used_at)}</span></div>
              <button className="btn danger sm" type="button" onClick={() => start(async () => { await revokeConnector(l.id); router.refresh(); })}>Revoke</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
