"use client";

import LoadBalancerTable from "@/components/LoadBalancerTable";
import RunTest from "@/components/RunTest";

export default function Home() {
  const handleDownloadCSV = async () => {
    const response = await fetch("/api/download-csv");
    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, "_blank");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-foreground">Run Test</h1>
        <RunTest />

        <h1 className="text-3xl font-bold mb-6 text-foreground">All Data</h1>
        <LoadBalancerTable />

        <button
          onClick={handleDownloadCSV}
          className="cursor-pointer mt-4 px-4 py-2 bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-md hover:bg-zinc-300 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Download Full CSV
        </button>
      </div>
    </div>
  );
}
