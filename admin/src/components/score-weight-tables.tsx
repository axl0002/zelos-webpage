"use client";

import { useState } from "react";
import type { ScoreRules } from "@/lib/score-rules";
import ScoreWeightTable from "./score-weight-table";

export default function ScoreWeightTables({ rules }: { rules: ScoreRules }) {
  const [hideEmptyRows, setHideEmptyRows] = useState(true);
  return (
    <>
      <label className="scoring-row-toggle">
        <input
          type="checkbox"
          checked={hideEmptyRows}
          onChange={(event) => setHideEmptyRows(event.target.checked)}
          aria-controls="push-weights pull-weights"
        />
        Hide empty rows
      </label>
      <div className="scoring-weight-groups">
        <ScoreWeightTable rules={rules} discipline="push" hideEmptyRows={hideEmptyRows} />
        <ScoreWeightTable rules={rules} discipline="pull" hideEmptyRows={hideEmptyRows} />
      </div>
    </>
  );
}
