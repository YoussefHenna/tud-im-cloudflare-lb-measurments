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
        <h1 className="text-3xl font-bold mb-6 text-foreground">
          Cloudflare Load Balancer Discovery
        </h1>

        <p className="text-md text-zinc-600 dark:text-zinc-400 mb-6">
          This is a tool that is part of a research project that attempts to map
          the Cloudflare Load Balancer network. A large portion of load
          balancers were discovered through an internal experiment and exposed
          to the public here. Additionally the tool allows you to run a test
          from your end and contribute to the discovery of more load balancers.
          For more information on the project read the full report here (TODO:
          Add link)
        </p>

        <p className="text-md text-zinc-600 dark:text-zinc-400 mb-6">
          Credits to: Anton Manakin & Youssef Henna (Technische Universität
          Dresden)
        </p>

        <RunTest />

        <h1 className="text-3xl font-bold mb-6 text-foreground">Map</h1>
        <p className="text-md text-zinc-600 dark:text-zinc-400 mb-6">
          This is a map representing the detected Cloudflare colocation centers
          and the number of load balancers detected in each colocation center.
          Data is based on initial measurments and does not adapt to newly
          discovered load balancers through the tool provided here.
        </p>
        <iframe
          src="https://www.google.com/maps/d/u/0/embed?mid=1sr53r4ETbnh1vTBYsPPWMw4CAq7Xraw&ehbc=2E312F&noprof=1"
          style={{ width: "100%", height: "700px" }}
        ></iframe>

        <h1 className="text-3xl font-bold mb-6 text-foreground mt-6">All Data</h1>
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
