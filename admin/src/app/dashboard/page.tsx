"use client";

import { useState, useEffect } from "react";
import { collection, getCountFromServer } from "firebase/firestore";
import { db } from "@/lib/firebase-client";
import UserGrowthChart from "./components/UserGrowthChart";

export default function AdminDashboard() {
  const [userCount, setUserCount] = useState<number | null>(null);

  useEffect(() => {
    const fetchUserCount = async () => {
      try {
        const usersCol = collection(db, "users");
        const snapshot = await getCountFromServer(usersCol);
        setUserCount(snapshot.data().count);
      } catch (err) {
        console.error("Error fetching user count:", err);
      }
    };

    fetchUserCount();
  }, []);

  return (
    <div className="p-6">
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Overview of Zelos performance and user metrics.
          </p>
          {userCount !== null && (
            <div className="mt-4 flex items-center">
              <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full border border-blue-200">
                {userCount.toLocaleString()} Users
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="col-span-1 md:col-span-2">
          <UserGrowthChart />
        </div>
      </div>
    </div>
  );
}
