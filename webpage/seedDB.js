require("dotenv").config();
const fs = require("fs/promises");
const csv = require("fast-csv");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("./src/prisma/generated/prisma");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const client = new PrismaClient({ adapter });

const CHUNK_SIZE = 50000;

const seedDB = async () => {
  const csvContents = await fs.readFile(
    "../data/full_dataset_combined.csv",
    "utf8"
  );

  console.log("Parsing CSV...");

  const dataToAdd = [];
  const stream = csv
    .parse({ headers: true })
    .on("error", (error) => console.error(error))
    .on(
      "data",
      ({
        timestamp,
        balancerId,
        clientIpAccodingCloudflare,
        clientCountryAccodingCloudflare,
        balancerColocationCenter,
      }) => {
        dataToAdd.push({
          id: balancerId,
          lastChecked: new Date(Number(timestamp) * 1000),
          ipAddress: clientIpAccodingCloudflare,
          country: clientCountryAccodingCloudflare,
          colocationCenter: balancerColocationCenter,
        });
      }
    )
    .on("end", async (rowCount) => {
      console.log("Data collected from csv.", rowCount, "entries");
      console.log(
        "Adding data to database in chunks of",
        CHUNK_SIZE,
        "using createMany..."
      );

      const total = dataToAdd.length;
      const totalChunks = Math.ceil(total / CHUNK_SIZE);

      for (let i = 0; i < total; i += CHUNK_SIZE) {
        const chunk = dataToAdd.slice(i, i + CHUNK_SIZE);
        const chunkIndex = i / CHUNK_SIZE + 1;

        console.log(
          `Inserting chunk ${chunkIndex}/${totalChunks} (records ${i + 1
          } to ${Math.min(i + CHUNK_SIZE, total)})`
        );

        await client.loadBalancer.createMany({
          data: chunk,
          skipDuplicates: true,
        });
      }

      console.log("All chunks inserted. Data added to database.");

      await client.$disconnect();
    });

  stream.write(csvContents);
  stream.end();
};

seedDB();
