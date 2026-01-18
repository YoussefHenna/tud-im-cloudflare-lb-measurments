import prismaClient from "@/prisma/client";
import { NextRequest } from "next/server";

export async function GET() {
  try {
    const loadBalancers = await prismaClient.loadBalancer.findMany();
    const csvHeader = [
      "id",
      "ipAddress",
      "country",
      "colocationCenter",
      "lastChecked",
    ];
    const csvContent = loadBalancers.map((lb) => [
      lb.id,
      lb.ipAddress,
      lb.country,
      lb.colocationCenter,
      new Date(lb.lastChecked).getTime(),
    ]);

    const csv = [
      csvHeader.join(","),
      ...csvContent.map((row) => row.join(",")),
    ].join("\n");

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=load_balancers.csv",
      },
    });
  } catch (error) {
    console.error("Error generating CSV:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}