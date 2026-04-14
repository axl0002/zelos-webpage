"use client";

import ReportsTab from "../components/ReportsTab";

export default function ReportsPage() {
  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-600 mt-1">
          Review and manage user reports.
        </p>
      </div>
      <ReportsTab />
    </div>
  );
}
