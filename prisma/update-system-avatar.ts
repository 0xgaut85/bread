import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Updating system user avatar to logo...");

  const systemWallet = "5CjzKTvs7BPkfjHh27JN1VcTSxqP9rzfP3nn1LGbJqsf";
  const logoUrl = "/logo.png";

  const updatedUser = await prisma.user.update({
    where: { walletAddress: systemWallet },
    data: {
      name: "bread.markets",
      avatarUrl: logoUrl,
    },
  });

  console.log(`✅ Updated system user: ${updatedUser.name} with avatar: ${updatedUser.avatarUrl}`);
}

main()
  .catch((e) => {
    console.error("❌ Failed to update system user:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
