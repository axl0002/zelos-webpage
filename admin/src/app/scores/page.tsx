import type { Metadata } from "next";
import { getPublicScoreRules } from "@/lib/score-rules.server";
import type { ScoreRules } from "@/lib/score-rules";
import ScoringGuide from "@/components/scoring-guide";
import "./scores.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "How Zelos points work | Formula & exercise weights",
  description:
    "See the exact Zelos record-points formula, every progression weight, worked examples and an interactive points calculator.",
  alternates: { canonical: "https://zelos.club/scores" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "How Zelos points work",
    description: "The formula. Every weight. No guesswork.",
    url: "https://zelos.club/scores",
    type: "website",
  },
  icons: { icon: "/assets/z_app_icon.png", apple: "/assets/z_app_icon.png" },
};
export default async function ScoresPage() {
  let rules: ScoreRules | null = null;
  try {
    rules = await getPublicScoreRules();
  } catch {
    /* Show unavailability, never silently present stale rules as current. */
  }
  return (
    <>
      <link rel="stylesheet" href="/styles.css" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
      />
      <a className="scores-skip" href="#main-content">
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
            <a href="/scores" className="nav-button active" aria-current="page">
              Scores
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
      <main id="main-content" className="scores-page">
        <header className="scores-hero">
          <p className="scores-eyebrow">The numbers behind your rank</p>
          <h1>
            Know your score.
            <br />
            <span>Understand every point.</span>
          </h1>
          <p className="scores-intro">
            Your exercise records become points through a published formula.
            Here’s how your performance, progression and place on the
            leaderboard add up.
          </p>
          {rules && (
            <div className="scores-meta">
              <span>Record points · formula v{rules.formula_version}</span>
              <span>Rules revision {rules.revision}</span>
              <span>
                Updated{" "}
                <time dateTime={rules.updated_at}>
                  {new Date(rules.updated_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    timeZone: "UTC",
                  })}
                </time>
              </span>
            </div>
          )}
        </header>
        {rules ? (
          <ScoringGuide rules={rules} />
        ) : (
          <section className="scores-section" role="status">
            <h2>Scoring details are temporarily unavailable.</h2>
            <p>
              We can’t verify the current formula and weights right now. Please
              try again shortly.
            </p>
            <a className="scores-link" href="/scores">
              Try again →
            </a>
          </section>
        )}
      </main>
      <footer className="site-footer">
        <div className="footer-container">
          <nav className="footer-links" aria-label="Footer navigation">
            <a href="/about">About</a>
            <a href="/scores" aria-current="page">
              Scores
            </a>
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
