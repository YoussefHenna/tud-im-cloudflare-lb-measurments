import prismaClient from "@/prisma/client";
import { NextRequest } from "next/server";

const LB_COUNT_LIMIT = 50;

// To be used for pagination of load balancers, returns a maximum of 50 load balancers, use `skip` to paginate through the load balancers.
export async function GET(request: NextRequest) {
  const skip = request.nextUrl.searchParams.get("skip")
    ? parseInt(request.nextUrl.searchParams.get("skip") ?? "0")
    : 0;

  try {
    const loadBalancers = await prismaClient.loadBalancer.findMany({
      skip,
      take: LB_COUNT_LIMIT,
      orderBy: {
        lastChecked: "desc",
      },
    });

    return new Response(JSON.stringify(loadBalancers), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching load balancers:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
