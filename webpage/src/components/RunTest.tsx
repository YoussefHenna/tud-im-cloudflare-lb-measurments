"use client";

import { LoadBalancer } from "@/prisma/generated/prisma";
import { parseTraceResult } from "@/utils";

import { useState } from "react";

const hostOptions = [
  { value: "https://cloudflare.com", label: "Cloudflare" },
  { value: "https://chatgpt.com", label: "ChatGPT" },
  { value: "https://claude.ai", label: "Claude" },
  // TODO: Add more hosts
];

export default function RunTest() {
  const [host, setHost] = useState<string>(hostOptions[0].value);
  const [numRuns, setNumRuns] = useState<number>(1);
  const [currentTestResults, setCurrentTestResults] = useState<LoadBalancer[]>(
    [],
  );
  const [isRunningTest, setIsRunningTest] = useState<boolean>(false);
  const [runWaitTime, setRunWaitTime] = useState<number>(60);
  const [dataShared, setDataShared] = useState<boolean>(false);

  const handleRunTest = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    async function runTest() {
      setDataShared(false);
      setIsRunningTest(true);
      const results: LoadBalancer[] = [];
      const testUrl = `${host}/cdn-cgi/trace`;
      let isFirstRun = true;

      for (let i = 0; i < numRuns; i++) {
        if (!isFirstRun) {
          await new Promise((resolve) =>
            setTimeout(resolve, runWaitTime * 1000),
          );
        }
        isFirstRun = false;

        const response = await fetch(testUrl, {
          headers: {
            Connection: "close",
          },
          credentials: "omit",
          cache: "no-store",
          redirect: "follow",
          keepalive: false,
        });

        const data = await response.text();
        results.push(parseTraceResult(data));
        setCurrentTestResults([...results]);
      }

      setIsRunningTest(false);
    }

    runTest();
  };

  const handleShareData = () => {
    async function shareData() {
      setDataShared(true);
      const response = await fetch("/api/submit-lb", {
        method: "POST",
        body: JSON.stringify(currentTestResults),
      });
      if (!response.ok) {
        throw new Error("Failed to submit load balancers");
      }
    }

    try {
      shareData();
    } catch (error) {
      console.error("Error sharing data:", error);
    }
  };

  return (
    <>
      <form
        onSubmit={handleRunTest}
        className="flex flex-col gap-4 mt-8 mb-4 bg-white dark:bg-zinc-900 p-4 rounded shadow"
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Run a test from your current device to find which load balancer you
          will connect to.
        </p>
        <div>
          <label
            htmlFor="host-select"
            className="block mb-1 font-medium text-zinc-700 dark:text-zinc-200"
          >
            Host
          </label>
          <select
            id="host-select"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            className="py-2 px-3 border rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
          >
            {hostOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="num-runs"
            className="block mb-1 font-medium text-zinc-700 dark:text-zinc-200"
          >
            # of Runs
          </label>
          <input
            id="num-runs"
            type="number"
            min={1}
            value={numRuns}
            onChange={(e) => setNumRuns(parseInt(e.target.value, 10) || 1)}
            className="py-2 px-3 border rounded w-24 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
          />
        </div>
        <div>
          <label
            htmlFor="run-wait-time"
            className="block mb-1 font-medium text-zinc-700 dark:text-zinc-200"
          >
            Run Wait Time (seconds)
          </label>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
            Time to wait between runs. This is to attempt to wait for browser
            connection to close and overcome sticky sessions. Different browser
            may keep connections open for longer, increase this value if you are
            seeing the same load balancer ID multiple times.
          </p>
          <input
            id="run-wait-time"
            type="number"
            min={1}
            value={runWaitTime}
            onChange={(e) => setRunWaitTime(parseInt(e.target.value, 10) || 60)}
            className="py-2 px-3 border rounded w-24 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-semibold max-w-48"
        >
          Run Test
        </button>
      </form>

      {currentTestResults.length > 0 && (
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2 text-foreground">
            Test Results
          </h2>
          {currentTestResults.map((result, index) => (
            <div
              key={result.id + index}
              className="mb-2 border-b border-zinc-200 dark:border-zinc-700 pb-2"
            >
              <p>Load Balancer ID: {result.id}</p>
              <p>IP Address: {result.ipAddress}</p>
              <p>Country: {result.country}</p>
              <p>Colocation Center: {result.colocationCenter}</p>
            </div>
          ))}
          {isRunningTest && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400 animate-pulse">
              Waiting until next run... ({runWaitTime} seconds)
            </p>
          )}

          {!isRunningTest && (
            <>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
                Test completed. You can choose to share this data with other to
                expand the data set.
              </p>
              {dataShared ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
                  Thank you for sharing your data!
                </p>
              ) : (
                <button
                  onClick={handleShareData}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-semibold max-w-48"
                >
                  Share Data
                </button>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
