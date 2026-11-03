"use client";
import { useEffect, useRef } from "react";
import type { simulate } from "@/lib/plan";
import type { Bucket } from "@/lib/types";

export default function Chart({ sim, buckets, horizon, month, history, onPick, compact, startMonth }: {
  sim: ReturnType<typeof simulate>; buckets: Bucket[]; horizon: number; month: number;
  history: { offset: number; net: number }[]; onPick: (m: number) => void; compact: (v: number) => string; startMonth: { y: number; m: number };
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const histLen = history.length ? Math.max(0, -Math.min(...history.map((h) => h.offset))) : 0;
  const L = 54, R = 10, T = 10, B = 26;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const draw = () => {
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
      if (!W || !H) return;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
      const pw = W - L - R, ph = H - T - B;
      const data = sim.slice(0, horizon);
      const span = horizon - 1 + histLen;
      let max = Math.max(...data.map((d) => d.net), ...history.map((h) => h.net), 1) * 1.08;
      const mag = Math.pow(10, Math.floor(Math.log10(max)));
      const stepY = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((x) => max / x <= 5) ?? mag;
      max = Math.ceil(max / stepY) * stepY;
      const X = (i: number) => L + ((i + histLen) / Math.max(span, 1)) * pw;
      const Y = (v: number) => T + ph - (v / max) * ph;
      ctx.strokeStyle = css("--line"); ctx.lineWidth = 1; ctx.fillStyle = css("--muted");
      ctx.font = "11px " + css("--f-mono"); ctx.textAlign = "right"; ctx.textBaseline = "middle";
      for (let v = 0; v <= max + 1; v += stepY) { const y = Math.round(Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(W - R, y); ctx.stroke(); ctx.fillText(compact(v), L - 6, y); }
      const base = new Array(data.length).fill(0);
      for (const b of buckets) {
        const top = data.map((d, i) => base[i] + Math.max(d.values[b.id] ?? 0, 0));
        ctx.beginPath(); ctx.moveTo(X(0), Y(top[0]));
        for (let i = 1; i < data.length; i++) ctx.lineTo(X(i), Y(top[i]));
        for (let i = data.length - 1; i >= 0; i--) ctx.lineTo(X(i), Y(base[i]));
        ctx.closePath(); ctx.fillStyle = css(`--c-${b.color}`); ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
        for (let i = 0; i < data.length; i++) base[i] = top[i];
      }
      if (history.length) {
        ctx.strokeStyle = css("--ink"); ctx.lineWidth = 2; ctx.beginPath();
        history.forEach((h, i) => (i ? ctx.lineTo(X(h.offset), Y(h.net)) : ctx.moveTo(X(h.offset), Y(h.net))));
        ctx.stroke(); ctx.fillStyle = css("--ink");
        history.forEach((h) => { ctx.beginPath(); ctx.arc(X(h.offset), Y(h.net), 3, 0, Math.PI * 2); ctx.fill(); });
      }
      ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillStyle = css("--muted");
      const every = horizon <= 60 ? 1 : horizon <= 120 ? 2 : 5;
      for (let i = -histLen; i < data.length; i++) {
        if ((startMonth.m + i + 1200) % 12 !== 0) continue;
        const yr = startMonth.y + Math.floor((startMonth.m + i) / 12);
        if ((yr - startMonth.y) % every !== 0) continue;
        ctx.fillText(String(yr), X(i), T + ph + 8);
      }
      if (month < horizon) {
        const x = Math.round(X(month)) + 0.5;
        ctx.strokeStyle = css("--ink"); ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = css("--ink"); ctx.beginPath(); ctx.arc(x, Y(data[month].net), 4, 0, Math.PI * 2); ctx.fill();
      }
    };
    draw();
    const ro = new ResizeObserver(draw); ro.observe(cv);
    const mq = window.matchMedia("(prefers-color-scheme: dark)"); mq.addEventListener("change", draw);
    const mo = new MutationObserver(draw); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { ro.disconnect(); mo.disconnect(); mq.removeEventListener("change", draw); };
  }, [sim, buckets, horizon, month, history, histLen, compact, startMonth]);

  return (
    <div className="chartwrap">
      <canvas ref={ref} role="img" aria-label="Stacked chart of every bucket over time"
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const span = horizon - 1 + histLen;
          const i = Math.round(((e.clientX - r.left - L) / (r.width - L - R)) * span) - histLen;
          onPick(Math.max(0, Math.min(horizon - 1, i)));
        }} />
    </div>
  );
}
