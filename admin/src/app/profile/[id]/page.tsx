import type { Metadata } from "next";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

// Untrusted display hints only. They never authorize access or change the ID.
async function profileHeading(searchParams: Props["searchParams"]) {
  const query = await searchParams ?? {};
  const username = typeof query.username === "string" && /^[a-zA-Z0-9_.]{1,30}$/.test(query.username)
    ? query.username : null;
  const country = typeof query.country === "string" ? query.country.replace(/_$/, "").toUpperCase() : "";
  const flag = /^[A-Z]{2}$/.test(country)
    ? String.fromCodePoint(...[...country].map(c => c.charCodeAt(0) + 0x1f1e6 - 65)) : "";
  return username ? `View ${username}${flag ? ` ${flag}` : ""} in Zelos` : "View profile in Zelos";
}
const description = "See their athlete records and training clips in the app.";
const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!validId.test(id)) return { title: "Profile – Zelos", robots: { index: false } };
  const url = `https://app.zelos.club/profile/${id.toLowerCase()}`;
  const title = await profileHeading(searchParams);
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: false, follow: false },
    appleWebApp: { capable: true, title: "Zelos" },
    other: { "apple-itunes-app": `app-id=6751625048, app-argument=${url}` },
    openGraph: { title, description, url, type: "website" },
    icons: { icon: "/assets/z_app_icon.png" },
  };
}

export default async function SharedProfile({ params, searchParams }: Props) {
  const { id } = await params;
  if (!validId.test(id)) notFound();
  const title = await profileHeading(searchParams);
  return <>
    <link rel="stylesheet" href="/styles.css" />
    <nav className="nav-bar" aria-label="Main navigation">
      <div className="nav-container">
        <a href="https://zelos.club" className="nav-logo" aria-label="Zelos home">
          <img src="/assets/z_app_icon.png" className="logo-img" alt="Zelos" />
        </a>
      </div>
    </nav>
    <main className="document-page legal-page">
      <header className="page-header">
        <h1 className="page-title">{title}</h1>
        <p className="page-intro">{description}</p>
      </header>
      <section className="document-card shared-profile-actions">
        <a className="btn-primary profile-open-button" href={`club.zelos.app://profile/${id.toLowerCase()}`}>Open in Zelos</a>
        <p>Don’t have Zelos yet? Download the app, then tap your profile link again.</p>
        <div className="cta-buttons">
          <a className="store-badge" href="https://apps.apple.com/gb/app/zelos/id6751625048" aria-label="Download on the App Store"><img src="/assets/app-store-badge.svg" alt="Download on the App Store" width="156" height="52" /></a>
          <a className="store-badge" href="https://play.google.com/store/apps/details?id=club.zelos.app" aria-label="Get it on Google Play"><img src="/assets/google-play-badge.svg" alt="Get it on Google Play" width="175.5" height="52" /></a>
        </div>
      </section>
    </main>
  </>;
}
