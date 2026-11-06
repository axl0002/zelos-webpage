import type { Metadata } from "next";
import { getPublicScoreRules } from "@/lib/score-rules.server";
import type { PublicScoreRules } from "@/lib/score-rules";
import { getPublicScoreWeights } from "@/lib/score-weights.server";
import ScoringWeights from "@/components/scoring-weights";
import {getPublicScoreExplanation} from "@/lib/score-explanation.server";
import ScoringExplanation from "@/components/scoring-explanation";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Scoring – Zelos",
  description:
    "Zelos exercise records and Push and Pull rankings.",
  alternates: { canonical: "https://zelos.club/scoring" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Scoring – Zelos",
    description:
      "Zelos exercise records and rankings.",
    url: "https://zelos.club/scoring",
    type: "website",
  },
  icons: { icon: "/assets/z_app_icon.png", apple: "/assets/z_app_icon.png" },
};
export default async function ScoringPage() {
  // Each response is independently guarded. A status outage must not hide
  // verified weights; a weights outage must never revive a stale formula.
  const [status, publishedWeights, publishedExplanation] = await Promise.allSettled([
    getPublicScoreRules(), getPublicScoreWeights(), getPublicScoreExplanation(),
  ]);
  const rules: PublicScoreRules | null = status.status === "fulfilled" ? status.value : null;
  const weights = publishedWeights.status === "fulfilled" ? publishedWeights.value : null;
  const explanation = publishedExplanation.status === "fulfilled" ? publishedExplanation.value : null;
  return (
    <>
      <link rel="stylesheet" href="/styles.css" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
      />
      <a className="document-skip" href="#main-content">
        Skip to scoring guide
      </a>
      <nav className="nav-bar" aria-label="Main navigation">
        <div className="nav-container">
          <a href="/" className="nav-logo" aria-label="Zelos home">
            <img
              src="/assets/z_app_icon.png"
              className="logo-img"
              alt="Zelos"
            />
          </a>
          <div className="nav-links">
            <a href="/scoring" className="nav-button" aria-current="page">
              Scoring
            </a>
            <a href="/stats" className="nav-button">
              Stats
            </a>
            <a href="https://shop.zelos.club/" className="nav-button">
              Shop
            </a>
          </div>
        </div>
      </nav>
      <main id="main-content" className="document-page legal-page scoring-page">
        <header className="page-header">
          <h1 className="page-title">Scoring</h1>
          {rules && (
            <p className="page-subtitle">
              Last updated:{" "}
              <time dateTime={rules.updated_at}>
                {new Date(rules.updated_at).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </time>
              <br />
              <span>Scoring status revision {rules.revision}</span>
            </p>
          )}
          <p className="page-intro">
            Current exercise weights and how your overall Elo is calculated.
          </p>
        </header>
        {!rules && <p role="status">Live scoring status is temporarily unavailable.</p>}
        <ScoringExplanation explanation={explanation}/>
        <ScoringWeights weights={weights}/>
      </main>
      <footer className="site-footer">
        <div className="footer-container">
          <nav className="footer-links" aria-label="Footer navigation">
            <a href="/scoring" aria-current="page">
              Scoring
            </a>
            <a href="/about">About</a>
            <a href="/support">Support</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </nav>
          <p className="footer-copy">
            © {new Date().getUTCFullYear()} Zelos. All rights reserved.
          </p>
        </div>
      </footer>
    </>
  );
}
