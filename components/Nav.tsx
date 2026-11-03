import Link from "next/link";

const LINKS = [
  { href: "/", label: "Plan" },
  { href: "/check-in", label: "Check-in" },
  { href: "/insurance", label: "Insurance" },
  { href: "/setup", label: "Setup" },
];

export default function Nav({ current }: { current: string }) {
  return (
    <nav className="nav">
      <div className="nav-in">
        <Link href="/" className="brand">Buckets</Link>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="link" aria-current={current === l.href ? "page" : undefined}>
            {l.label}
          </Link>
        ))}
        <form action="/auth/signout" method="post">
          <button className="btn ghost sm" type="submit">Sign out</button>
        </form>
      </div>
    </nav>
  );
}
