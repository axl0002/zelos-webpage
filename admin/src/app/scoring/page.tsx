import type { Metadata } from "next";
import { getPublicScoreRules } from "@/lib/score-rules.server";
import type { PublicScoreRules } from "@/lib/score-rules";
import ScoringGuide from "@/components/scoring-guide";
import { getPublicScoreWeights } from "@/lib/score-weights.server";
import ScoringWeights from "@/components/scoring-weights";
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
  const [status, publishedWeights] = await Promise.allSettled([
    getPublicScoreRules(), getPublicScoreWeights(),
  ]);
  const rules: PublicScoreRules | null = status.status === "fulfilled" ? status.value : null;
  const weights = publishedWeights.status === "fulfilled" ? publishedWeights.value : null;
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
              {rules.schema_version===1&&<>Formula v{rules.formula_version} · </>}
              <span>Rules revision {rules.revision}</span>
            </p>
          )}
          <p className="page-intro">
            Zelos calculates your Push and Pull scores from eligible exercise records.
            View your current scores and positions in the app.
          </p>
        </header>
        {rules?.schema_version===2 ? (
          <section className="document-card"><h2>Your rankings</h2><p>Your eligible exercise records contribute to your Push and Pull scores. Open the app to see your current leaderboard positions.</p></section>
        ) : rules ? (
          <ScoringGuide rules={rules} />
        ) : (
          <section className="document-card" role="status">
            <h2>Scoring details are temporarily unavailable.</h2>
            <p>
              We can’t verify the current scoring status right now. Please
              try again shortly.
            </p>
            <a href="/scoring">Try again</a>
          </section>
        )}
        {rules?.schema_version !== 1 && <ScoringWeights weights={weights} />}
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
