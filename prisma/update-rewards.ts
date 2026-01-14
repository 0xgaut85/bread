import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Updating task rewards to 25 USDC...\n");

  const result = await prisma.task.updateMany({
    where: { status: "OPEN" },
    data: { reward: 25 },
  });

  console.log(`✅ Updated ${result.count} tasks to 25 USDC reward`);
}

main()
  .catch((e) => {
    console.error("❌ Update failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
