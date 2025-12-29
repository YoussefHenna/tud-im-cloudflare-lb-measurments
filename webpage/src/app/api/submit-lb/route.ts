import prismaClient from "@/prisma/client";
import zod from "zod";

const bodySchema = zod.array(
  zod.object({
    id: zod.string(),
    ipAddress: zod.string(),
    country: zod.string(),
    colocationCenter: zod.string(),
  })
);

export async function POST(request: Request) {
  // Parse the request body
  const body = await request.json();
  const parsedBody = bodySchema.safeParse(body);

  if (!parsedBody.success) {
    return new Response(JSON.stringify({ error: parsedBody.error.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  for (const lb of parsedBody.data) {
    await prismaClient.loadBalancer.upsert({
      where: { id: lb.id },
      create: {
        id: lb.id,
        ipAddress: lb.ipAddress,
        country: lb.country,
        colocationCenter: lb.colocationCenter,
      },
      update: {
        lastChecked: new Date(),
      },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}
