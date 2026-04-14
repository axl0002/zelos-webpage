"use client";

import { useState, useEffect, useCallback } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  limit,
  Timestamp,
} from "firebase/firestore";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceArea,
} from "recharts";
import { db } from "@/lib/firebase-client";

const DISCIPLINE_COLORS: Record<string, string> = {
  pull: "#3B82F6",
  push: "#EF4444",
  legs: "#22C55E",
  static: "#A855F7",
  freestyle: "#F59E0B",
};

type EloEntry = {
  ts: Date;
  post: number;
  pre: number;
  delta: number;
  discipline: string;
  result: number;
};

// Custom dot: triangle up = win, circle = draw, triangle down = loss
function ResultDot({ cx, cy, payload, dataKey, stroke }: {
  cx?: number; cy?: number; payload?: Record<string, unknown>; dataKey?: string; stroke?: string;
}) {
  if (cx == null || cy == null || !payload || !dataKey) return null;
  const result = payload[`${dataKey}_result`] as number | null;
  if (result == null) return null;

  if (result === 1) {
    // Win: triangle pointing up
    return (
      <polygon
        points={`${cx},${cy - 5} ${cx - 4},${cy + 3} ${cx + 4},${cy + 3}`}
        fill={stroke}
        stroke={stroke}
        strokeWidth={1}
      />
    );
  } else if (result === 0) {
    // Loss: triangle pointing down
    return (
      <polygon
        points={`${cx - 4},${cy - 3} ${cx + 4},${cy - 3} ${cx},${cy + 5}`}
        fill={stroke}
        stroke={stroke}
        strokeWidth={1}
      />
    );
  } else {
    // Draw (0.5): circle
    return (
      <circle cx={cx} cy={cy} r={3} fill={stroke} stroke={stroke} strokeWidth={1} />
    );
  }
}

export default function EloAnalysisPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<{ uid: string; username: string; country: string }[]>([]);
  const [selectedUser, setSelectedUser] = useState<{ uid: string; username: string; country: string } | null>(null);
  const [eloData, setEloData] = useState<EloEntry[]>([]);
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [visibleDisciplines, setVisibleDisciplines] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [zoomLeft, setZoomLeft] = useState<number | null>(null);
  const [zoomRight, setZoomRight] = useState<number | null>(null);
  const [zoomDomain, setZoomDomain] = useState<{ x: [number, number]; y: [number, number] } | null>(null);

  const handleMouseDown = (e: { activeLabel?: number }) => {
    if (e?.activeLabel != null) setZoomLeft(e.activeLabel);
  };

  const handleMouseMove = (e: { activeLabel?: number }) => {
    if (zoomLeft != null && e?.activeLabel != null) setZoomRight(e.activeLabel);
  };

  const handleMouseUp = () => {
    if (zoomLeft != null && zoomRight != null && zoomLeft !== zoomRight) {
      const left = Math.min(zoomLeft, zoomRight);
      const right = Math.max(zoomLeft, zoomRight);
      // Calculate Y domain from visible data in range
      const inRange = chartData.filter((d) => d.ts >= left && d.ts <= right);
      let yMin = Infinity;
      let yMax = -Infinity;
      inRange.forEach((d) => {
        disciplines.forEach((disc) => {
          if (visibleDisciplines.has(disc)) {
            const val = (d as Record<string, unknown>)[disc] as number | null;
            if (val != null) {
              if (val < yMin) yMin = val;
              if (val > yMax) yMax = val;
            }
          }
        });
      });
      const yPad = Math.max((yMax - yMin) * 0.1, 10);
      setZoomDomain({ x: [left, right], y: [yMin - yPad, yMax + yPad] });
    }
    setZoomLeft(null);
    setZoomRight(null);
  };

  const resetZoom = () => setZoomDomain(null);

  // Search users by username
  const searchUsers = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    setSearchLoading(true);
    try {
      const usersRef = collection(db, "users");
      const snap = await getDocs(
        query(
          usersRef,
          where("username", ">=", q.toLowerCase()),
          where("username", "<=", q.toLowerCase() + "\uf8ff"),
          limit(10)
        )
      );
      setSuggestions(
        snap.docs.map((d) => ({
          uid: d.id,
          username: d.data().username || d.id,
          country: d.data().country || "",
        }))
      );
    } catch {
      setSuggestions([]);
    }
    setSearchLoading(false);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => searchUsers(searchQuery), 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, searchUsers]);

  // Fetch elo history for selected user
  const fetchEloHistory = useCallback(async (uid: string) => {
    setLoading(true);
    try {
      const eloRef = collection(db, "users", uid, "eloHistory");
      const snap = await getDocs(query(eloRef, orderBy("ts", "asc")));

      const entries: EloEntry[] = snap.docs.map((d) => {
        const data = d.data();
        const ts = data.ts instanceof Timestamp ? data.ts.toDate() : new Date(data.ts);
        return {
          ts,
          post: data.post,
          pre: data.pre,
          delta: data.delta,
          discipline: data.discipline,
          result: data.result,
        };
      });

      const uniqueDisciplines = Array.from(new Set(entries.map((e) => e.discipline))).sort();
      setEloData(entries);
      setDisciplines(uniqueDisciplines);
      setVisibleDisciplines(new Set(uniqueDisciplines));
    } catch (err) {
      console.error("Error fetching elo history:", err);
      alert("Failed to fetch elo history: " + (err instanceof Error ? err.message : "Unknown error"));
      setEloData([]);
      setDisciplines([]);
    }
    setLoading(false);
  }, []);

  const selectUser = (user: { uid: string; username: string; country: string }) => {
    setSelectedUser(user);
    setSearchQuery(user.username);
    setSuggestions([]);
    fetchEloHistory(user.uid);
  };

  const toggleDiscipline = (d: string) => {
    setVisibleDisciplines((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  };

  // Build chart data: one entry per timestamp, with a column per discipline
  const chartData = (() => {
    const byDiscipline: Record<string, EloEntry[]> = {};
    eloData.forEach((e) => {
      if (!byDiscipline[e.discipline]) byDiscipline[e.discipline] = [];
      byDiscipline[e.discipline].push(e);
    });

    // Merge all entries into a single timeline
    const allEntries = eloData
      .filter((e) => visibleDisciplines.has(e.discipline))
      .sort((a, b) => a.ts.getTime() - b.ts.getTime());

    const running: Record<string, number> = {};
    const runningResult: Record<string, number> = {};
    return allEntries.map((e) => {
      running[e.discipline] = e.post;
      runningResult[e.discipline] = e.result;
      return {
        ts: e.ts.getTime(),
        label: e.ts.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        ...Object.fromEntries(
          disciplines.filter((d) => visibleDisciplines.has(d)).map((d) => [d, running[d] ?? null])
        ),
        ...Object.fromEntries(
          disciplines.filter((d) => visibleDisciplines.has(d)).map((d) => [`${d}_result`, runningResult[d] ?? null])
        ),
      };
    });
  })();

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Elo Analysis</h1>
        <p className="text-gray-600 mt-1">Search for a user to view their Elo rating history.</p>
      </div>

      {/* Search bar */}
      <div className="relative mb-6 max-w-md">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (selectedUser && e.target.value !== selectedUser.username) {
              setSelectedUser(null);
            }
          }}
          placeholder="Search by username..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        {searchLoading && (
          <div className="absolute right-3 top-2.5">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          </div>
        )}
        {suggestions.length > 0 && !selectedUser && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {suggestions.map((user) => (
              <button
                key={user.uid}
                onClick={() => selectUser(user)}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
              >
                <span className="font-medium text-gray-900">{user.username}</span>
                {user.country && <span className="text-gray-400 text-xs ml-2">{user.country}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* Chart */}
      {selectedUser && !loading && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <div className="flex flex-wrap items-center justify-between mb-6 gap-3">
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                {selectedUser.username}
              </h3>
              <span className="text-sm text-gray-500">{eloData.length} elo changes</span>
            </div>
            {disciplines.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {disciplines.map((d) => (
                  <button
                    key={d}
                    onClick={() => toggleDiscipline(d)}
                    className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors capitalize ${
                      visibleDisciplines.has(d)
                        ? "border-transparent text-white"
                        : "border-gray-200 text-gray-400 bg-white"
                    }`}
                    style={
                      visibleDisciplines.has(d)
                        ? { backgroundColor: DISCIPLINE_COLORS[d] || "#6B7280" }
                        : undefined
                    }
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-4 mb-4 text-xs text-gray-500 items-center">
            <span className="flex items-center gap-1">
              <svg width="10" height="10"><polygon points="5,1 1,9 9,9" fill="#6B7280" /></svg>
              Win
            </span>
            <span className="flex items-center gap-1">
              <svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="#6B7280" /></svg>
              Draw
            </span>
            <span className="flex items-center gap-1">
              <svg width="10" height="10"><polygon points="1,1 9,1 5,9" fill="#6B7280" /></svg>
              Loss
            </span>
            {zoomDomain && (
              <button
                onClick={resetZoom}
                className="ml-4 px-2 py-0.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
              >
                Reset Zoom
              </button>
            )}
            {!zoomDomain && <span className="ml-4 text-gray-400">Drag to zoom</span>}
          </div>

          {chartData.length === 0 ? (
            <div className="text-center text-gray-500 py-12">
              No elo history found for this user.
            </div>
          ) : (
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  onMouseDown={handleMouseDown as unknown as (e: unknown) => void}
                  onMouseMove={handleMouseMove as unknown as (e: unknown) => void}
                  onMouseUp={handleMouseUp}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis
                    dataKey="ts"
                    type="number"
                    domain={zoomDomain ? zoomDomain.x : ["dataMin", "dataMax"]}
                    tickFormatter={(value) => {
                      const d = new Date(value);
                      return `${d.getMonth() + 1}/${d.getDate()}`;
                    }}
                    tick={{ fontSize: 12, fill: "#6B7280" }}
                    tickLine={false}
                    axisLine={false}
                    allowDataOverflow={!!zoomDomain}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: "#6B7280" }}
                    tickLine={false}
                    axisLine={false}
                    domain={zoomDomain ? zoomDomain.y : ["auto", "auto"]}
                    allowDataOverflow={!!zoomDomain}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const ts = new Date(payload[0].payload.ts);
                        return (
                          <div className="bg-white p-3 border border-gray-100 shadow-lg rounded-xl min-w-[140px]">
                            <p className="font-semibold text-gray-900 mb-1 text-sm">
                              {ts.toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </p>
                            {payload.map((p) =>
                              p.value != null ? (
                                <p
                                  key={p.dataKey as string}
                                  className="text-sm font-bold capitalize"
                                  style={{ color: p.color }}
                                >
                                  {p.dataKey as string}: {p.value}
                                </p>
                              ) : null
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend
                    wrapperStyle={{ paddingTop: "20px", textTransform: "capitalize" }}
                  />
                  {disciplines
                    .filter((d) => visibleDisciplines.has(d))
                    .map((d) => (
                      <Line
                        key={d}
                        type="monotone"
                        dataKey={d}
                        name={d}
                        stroke={DISCIPLINE_COLORS[d] || "#6B7280"}
                        strokeWidth={2}
                        dot={<ResultDot stroke={DISCIPLINE_COLORS[d] || "#6B7280"} />}
                        activeDot={{ r: 5 }}
                        connectNulls
                      />
                    ))}
                  {zoomLeft != null && zoomRight != null && (
                    <ReferenceArea
                      x1={zoomLeft}
                      x2={zoomRight}
                      strokeOpacity={0.3}
                      fill="#3B82F6"
                      fillOpacity={0.1}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
