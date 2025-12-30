import prismaClient from "@/prisma/client";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const countries = await prismaClient.loadBalancer.findMany({
      distinct: ["country"],
      select: {
        country: true,
      },
    });

    const countryList = countries.map((country) => country.country).sort();

    return new Response(JSON.stringify(countryList), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching countries:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
