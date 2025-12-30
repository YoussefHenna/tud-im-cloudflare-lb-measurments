"use client";

import { LB_COUNT_LIMIT } from "@/utils";
import { useEffect, useState } from "react";
import type { LoadBalancer } from "@/prisma/generated/prisma";

export default function LoadBalancerTable() {
  const [loadBalancers, setLoadBalancers] = useState<LoadBalancer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [countries, setCountries] = useState<string[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>("");

  const fetchCountries = async () => {
    try {
      const response = await fetch("/api/list-countries");
      if (!response.ok) {
        throw new Error("Failed to fetch countries");
      }
      const data: string[] = await response.json();
      setCountries(data);
    } catch (err) {
      console.error("Error fetching countries:", err);
    }
  };

  const fetchLoadBalancers = async (skipValue: number, country?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/get-lbs", window.location.origin);
      url.searchParams.set("skip", skipValue.toString());
      if (country) {
        url.searchParams.set("country", country);
      }

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error("Failed to fetch load balancers");
      }
      const data: LoadBalancer[] = await response.json();
      setLoadBalancers(data);

      // if received data equal to limit, then there are more load balancers to fetch
      setHasMore(data.length === LB_COUNT_LIMIT);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCountries();
  }, []);

  useEffect(() => {
    fetchLoadBalancers(skip, selectedCountry || undefined);
  }, [skip, selectedCountry]);

  const handleCountryChange = (country: string) => {
    setSelectedCountry(country);
    setSkip(0); // Reset to first page when country filter changes
  };

  const handlePrevious = () => {
    if (skip >= LB_COUNT_LIMIT) {
      setSkip(skip - LB_COUNT_LIMIT);
    }
  };

  const handleNext = () => {
    if (hasMore) {
      setSkip(skip + LB_COUNT_LIMIT);
    }
  };

  return (
    <>
      <div className="mb-4 flex items-center gap-4">
        <select
          id="country-filter"
          value={selectedCountry}
          onChange={(e) => handleCountryChange(e.target.value)}
          className="px-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-zinc-500 dark:focus:ring-zinc-400"
        >
          <option value="">All Countries</option>
          {countries.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="text-center py-8 text-foreground">Loading...</div>
      )}

      {error && (
        <div className="bg-red-100 dark:bg-red-900 border border-red-400 text-red-700 dark:text-red-200 px-4 py-3 rounded mb-4">
          Error: {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700">
                <thead className="bg-zinc-100 dark:bg-zinc-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                      IP Address
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                      Country
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                      Colocation Center
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                      Last Checked
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-700">
                  {loadBalancers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-4 text-center text-zinc-500 dark:text-zinc-400"
                      >
                        No load balancers found
                      </td>
                    </tr>
                  ) : (
                    loadBalancers.map((lb) => (
                      <tr
                        key={lb.id}
                        className="hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground font-mono">
                          {lb.id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground font-mono">
                          {lb.ipAddress}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                          {lb.country}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                          {lb.colocationCenter}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                          {new Date(lb.lastChecked).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={handlePrevious}
              disabled={skip === 0 || loading}
              className="px-4 py-2 bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-md hover:bg-zinc-300 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>

            <button
              onClick={handleNext}
              disabled={!hasMore || loading}
              className="px-4 py-2 bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-md hover:bg-zinc-300 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </>
      )}
    </>
  );
}
