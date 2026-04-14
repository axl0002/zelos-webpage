"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  startAfter,
  QueryDocumentSnapshot,
  QueryConstraint,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase-client";

type ChartData = {
  date: string;
  count: number;
};

function formatDateLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${monthNames[parseInt(month) - 1]} ${parseInt(day)}, ${year}`;
}

export default function UserGrowthChart() {
  const [data, setData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [debugInfo, setDebugInfo] = useState({ fetched: 0, totalInPeriod: 0 });
  const [days, setDays] = useState<14 | 30 | 60 | 90>(14);
  const [pageOffset, setPageOffset] = useState(0);
  const [earliestDate, setEarliestDate] = useState<string | null>(null);

  useEffect(() => {
    const fetchEarliest = async () => {
      try {
        const usersCol = collection(db, "users");
        const q = query(usersCol, orderBy("createdAt", "asc"), limit(1));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          const createdAt = doc.data().createdAt;
          if (createdAt?.toDate) {
            setEarliestDate(createdAt.toDate().toISOString().split("T")[0]);
          } else if (typeof createdAt === "string") {
            setEarliestDate(createdAt.split("T")[0]);
          }
        }
      } catch (err) {
        console.error("Error fetching earliest user:", err);
      }
    };
    fetchEarliest();
  }, []);

  const getDateWindow = useCallback(() => {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - pageOffset * days);
    endDate.setHours(23, 59, 59, 999);

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days + 1);
    startDate.setHours(0, 0, 0, 0);

    return { startDate, endDate };
  }, [days, pageOffset]);

  const canGoBack = useCallback(() => {
    if (!earliestDate) return false;
    const { startDate } = getDateWindow();
    const earliest = new Date(earliestDate);
    earliest.setHours(0, 0, 0, 0);
    return startDate > earliest;
  }, [earliestDate, getDateWindow]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      try {
        const { endDate } = getDateWindow();
        const usersCol = collection(db, "users");

        // Fetch all users with createdAt, paginated
        let allUsers: { createdAt: string }[] = [];
        const pageSize = 1000;
        let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;
        let hasMore = true;

        while (hasMore) {
          const constraints: QueryConstraint[] = [orderBy("createdAt", "asc")];
          if (lastDoc) {
            constraints.push(startAfter(lastDoc));
          }
          constraints.push(limit(pageSize));
          const q = query(usersCol, ...constraints);

          const snapshot = await getDocs(q);
          if (snapshot.empty) {
            hasMore = false;
            break;
          }

          snapshot.docs.forEach((doc) => {
            const docData = doc.data();
            if (docData.createdAt) {
              const date = docData.createdAt.toDate
                ? docData.createdAt.toDate().toISOString()
                : docData.createdAt;
              allUsers.push({ createdAt: date });
            }
          });

          lastDoc = snapshot.docs[snapshot.docs.length - 1];
          if (snapshot.docs.length < pageSize) {
            hasMore = false;
          }

          if (allUsers.length > 50000) {
            hasMore = false;
          }
        }

        // Build daily stats
        const dailyStats: Record<string, number> = {};
        for (let i = 0; i < days; i++) {
          const d = new Date(endDate);
          d.setDate(d.getDate() - i);
          const dateString = d.toISOString().split("T")[0];
          dailyStats[dateString] = 0;
        }

        let inPeriodCount = 0;
        allUsers.forEach((user) => {
          const dateString = new Date(user.createdAt).toISOString().split("T")[0];
          if (dailyStats[dateString] !== undefined) {
            dailyStats[dateString]++;
            inPeriodCount++;
          }
        });

        const chartData = Object.entries(dailyStats)
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => a.date.localeCompare(b.date));

        setData(chartData);
        setDebugInfo({
          fetched: allUsers.length,
          totalInPeriod: inPeriodCount,
        });
      } catch (err) {
        console.error("Error fetching user growth data:", err);
      }

      setLoading(false);
    };

    fetchData();
  }, [days, pageOffset, getDateWindow]);

  const { startDate, endDate } = getDateWindow();
  const startLabel = formatDateLabel(startDate.toISOString().split("T")[0]);
  const endLabel = formatDateLabel(endDate.toISOString().split("T")[0]);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];
  const showSevenDayLine = data.some((d) => d.date === sevenDaysAgoStr);

  if (loading)
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex flex-col h-[460px]">
        <div className="flex flex-wrap justify-between items-center mb-6 gap-3">
          <h3 className="text-lg font-bold text-gray-900">User Growth</h3>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-gray-400">Loading chart data...</span>
        </div>
      </div>
    );

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 col-span-1 md:col-span-2">
      <div className="flex flex-wrap justify-between items-center mb-6 gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-gray-900">User Growth</h3>
          <span className="text-sm text-gray-500">
            {startLabel} &ndash; {endLabel}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPageOffset((prev) => prev + 1)}
              disabled={!canGoBack()}
              className={`p-1.5 rounded-md border transition-colors ${
                canGoBack()
                  ? "text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-900"
                  : "text-gray-300 border-gray-100 cursor-not-allowed"
              }`}
              title="Previous period"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="bg-white p-0.5 rounded-md border border-gray-200 flex">
              {([14, 30, 60, 90] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    setDays(d);
                    setPageOffset(0);
                  }}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    days === d
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
            <button
              onClick={() => setPageOffset((prev) => Math.max(0, prev - 1))}
              disabled={pageOffset === 0}
              className={`p-1.5 rounded-md border transition-colors ${
                pageOffset > 0
                  ? "text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-900"
                  : "text-gray-300 border-gray-100 cursor-not-allowed"
              }`}
              title="Next period"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <span className="text-xs text-gray-400">
            {debugInfo.totalInPeriod} new users in period ({debugInfo.fetched}{" "}
            total scanned)
          </span>
        </div>
      </div>
      <div className="h-[350px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => {
                const [, month, day] = value.split("-");
                return `${parseInt(month)}/${parseInt(day)}`;
              }}
              tick={{ fontSize: 12, fill: "#6B7280" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: "#6B7280" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: "#F9FAFB" }}
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  let formattedLabel = label;
                  if (typeof label === "string") {
                    const dateParts = label.split("-");
                    if (dateParts.length === 3) {
                      formattedLabel = `${dateParts[1]}/${dateParts[2]}/${dateParts[0]}`;
                    }
                  }
                  return (
                    <div className="bg-white p-3 border border-gray-100 shadow-lg rounded-xl min-w-[120px]">
                      <p className="font-semibold text-gray-900 mb-1">
                        {formattedLabel}
                      </p>
                      <p className="text-sm font-bold text-blue-700">
                        {payload[0].value} new users
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            {showSevenDayLine && (
              <ReferenceLine
                x={sevenDaysAgoStr}
                stroke="#9CA3AF"
                strokeDasharray="4 4"
                label={{
                  value: "7d ago",
                  position: "top",
                  fill: "#9CA3AF",
                  fontSize: 11,
                }}
              />
            )}
            <Legend wrapperStyle={{ paddingTop: "20px" }} />
            <Bar
              dataKey="count"
              name="New Users"
              fill="#3B82F6"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
