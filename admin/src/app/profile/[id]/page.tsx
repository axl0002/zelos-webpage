import type { Metadata } from "next";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ id: string }> };
const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!validId.test(id)) return { title: "Profile – Zelos", robots: { index: false } };
  const url = `https://app.zelos.club/profile/${id.toLowerCase()}`;
  return {
    title: "View profile in Zelos",
    description: "See this athlete’s records and training clips in Zelos.",
    alternates: { canonical: url },
    robots: { index: false, follow: false },
    appleWebApp: { capable: true, title: "Zelos" },
    other: { "apple-itunes-app": `app-id=6751625048, app-argument=${url}` },
    openGraph: { title: "View profile in Zelos", description: "Records, rankings and training progress.", url, type: "website" },
    icons: { icon: "/assets/z_app_icon.png" },
  };
}

export default async function SharedProfile({ params }: Props) {
  const { id } = await params;
  if (!validId.test(id)) notFound();
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
        <h1 className="page-title">View profile in Zelos</h1>
        <p className="page-intro">See this athlete’s records and training clips in the app.</p>
      </header>
      <section className="document-card">
        <a className="btn-primary" style={{ display: "inline-block", textDecoration: "none" }} href={`club.zelos.app://profile/${id.toLowerCase()}`}>Open in Zelos</a>
        <p>Don’t have Zelos yet? Download the app, then tap your profile link again.</p>
        <div className="cta-buttons">
          <a className="btn-secondary" href="https://apps.apple.com/app/zelos/id6751625048">App Store</a>
          <a className="btn-secondary" href="https://play.google.com/store/apps/details?id=club.zelos.app">Google Play</a>
        </div>
      </section>
    </main>
  </>;
}
