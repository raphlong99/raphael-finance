import Link from "next/link";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/check-in", label: "Check-in" },
  { href: "/insurance", label: "Insurance" },
  { href: "/setup", label: "Settings" },
];

export default function Nav({ current }: { current: string }) {
  return (
    <nav className="nav">
      <div className="nav-in">
        <Link href="/" className="brand">Buckets</Link>
        <div className="nav-links">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="link" aria-current={current === l.href ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </div>
        <form action="/auth/signout" method="post">
          <button className="btn ghost sm" type="submit" aria-label="Sign out">Sign out</button>
        </form>
      </div>
    </nav>
  );
}
