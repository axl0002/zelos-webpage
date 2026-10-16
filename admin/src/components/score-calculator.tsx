"use client";
import { useState } from "react";
import { formatPoints, recordPoints, type ScoreRules } from "@/lib/score-rules";
export default function ScoreCalculator({ rules }: { rules: ScoreRules }) {
  const choices = rules.weights.filter((w) => w.enabled);
  const [board, setBoard] = useState(
    choices.find((w) => w.id === "planche-hold-full")?.id ??
      choices[0]?.id ??
      "",
  );
  const [participants, setParticipants] = useState("10");
  const [rank, setRank] = useState("1");
  const current = choices.find((w) => w.id === board);
  const n = /^\d+$/.test(participants) ? Number(participants) : NaN;
  const r = /^\d+$/.test(rank) ? Number(rank) : NaN;
  const points = current
    ? recordPoints(current.weight, n, r, rules.smoothing)
    : null;
  return (
    <div className="score-calculator">
      <div className="score-calculator-inputs">
        <label htmlFor="score-board">Exercise / progression</label>
        <select
          id="score-board"
          value={board}
          onChange={(e) => setBoard(e.target.value)}
        >
          {choices.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} · weight {w.weight}
            </option>
          ))}
        </select>
        <div className="score-input-pair">
          <div>
            <label htmlFor="score-participants">Athletes on this board</label>
            <input
              id="score-participants"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={participants}
              onChange={(e) => setParticipants(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="score-rank">Your position</label>
            <input
              id="score-rank"
              type="number"
              inputMode="numeric"
              min="1"
              max={Number.isFinite(n) ? n : undefined}
              step="1"
              value={rank}
              onChange={(e) => setRank(e.target.value)}
            />
          </div>
        </div>
        <p className="scores-muted">
          Use the worldwide position and athlete count for this progression and
          gender. This is an illustration, not a prediction of your current
          rank.
        </p>
      </div>
      <div
        className="score-calculator-output"
        aria-live="polite"
        aria-atomic="true"
      >
        {points === null ? (
          <p>
            Enter a whole-number athlete count and a position from 1 to that
            count.
          </p>
        ) : (
          <>
            <span className="scores-eyebrow">Record points</span>
            <strong>{formatPoints(points)}</strong>
            <p>
              {current!.weight} × ({n} − {r} + 1 + {rules.smoothing} × 0.5) ÷ (
              {n} + {rules.smoothing})
            </p>
          </>
        )}
      </div>
    </div>
  );
}
