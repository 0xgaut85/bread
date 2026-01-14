import { PrismaClient, Category, SubmissionType, TaskType, TaskStatus } from "@prisma/client";

const prisma = new PrismaClient();

// Default bread tasks that last 12 hours
const BREAD_TASKS = [
  {
    title: "X Thread About Bread",
    description: `Create an engaging X/Twitter thread about bread.markets!

Requirements:
- Minimum 5 tweets in the thread
- Explain what bread.markets is and how it works
- Include why people should use it
- Make it engaging and shareable
- Tag @breadmarkets

Submit the link to your thread.`,
    category: Category.THREAD,
    submissionType: SubmissionType.LINK,
    reward: 25,
  },
  {
    title: "Best Bread Meme",
    description: `Create the best meme about bread.markets!

Requirements:
- Original meme (not reposted)
- Must be related to bread.markets, earning crypto, or completing tasks
- High quality image
- Funny and shareable

Submit your meme image directly.`,
    category: Category.MEME,
    submissionType: SubmissionType.IMAGE,
    reward: 25,
  },
  {
    title: "Bread Post Template",
    description: `Design a reusable social media post template for bread.markets!

Requirements:
- Clean, professional design
- Include space for task details (title, reward, deadline)
- Use the bread.markets brand colors (black background, green accents #02FF40)
- Should work for X/Twitter or Instagram
- Include the bread.markets logo or branding

Submit your template design as an image.`,
    category: Category.DESIGN,
    submissionType: SubmissionType.IMAGE,
    reward: 25,
  },
  {
    title: "Bread Ideas - How to Improve",
    description: `Share your best ideas to improve bread.markets!

We want to hear from you. What features would make bread.markets better?

Requirements:
- At least 3 detailed ideas
- Explain why each idea would help users
- Be specific and actionable
- Think about both task creators and workers

Submit your ideas as text.`,
    category: Category.OTHER,
    submissionType: SubmissionType.TEXT,
    reward: 25,
  },
];

async function main() {
  console.log("🍞 Seeding bread tasks...\n");

  // Create or get the system user for bread tasks
  const systemWallet = process.env.ESCROW_WALLET_ADDRESS || "5CjzKTvs7BPkfjHh27JN1VcTSxqP9rzfP3nn1LGbJqsf";
  
  let systemUser = await prisma.user.findUnique({
    where: { walletAddress: systemWallet },
  });

  const logoUrl = "/logo.png";
  
  if (!systemUser) {
    systemUser = await prisma.user.create({
      data: {
        walletAddress: systemWallet,
        name: "bread.markets",
        avatarUrl: logoUrl,
      },
    });
    console.log("✅ Created system user:", systemUser.walletAddress);
  } else {
    // Update existing system user to have logo avatar
    if (systemUser.avatarUrl !== logoUrl || systemUser.name !== "bread.markets") {
      systemUser = await prisma.user.update({
        where: { walletAddress: systemWallet },
        data: {
          name: "bread.markets",
          avatarUrl: logoUrl,
        },
      });
      console.log("✅ Updated system user with logo avatar");
    } else {
      console.log("✅ Found existing system user:", systemUser.walletAddress);
    }
  }

  // Create tasks with 12-hour deadline
  const deadline = new Date();
  deadline.setHours(deadline.getHours() + 12);

  for (const taskData of BREAD_TASKS) {
    // Check if task already exists
    const existingTask = await prisma.task.findFirst({
      where: {
        title: taskData.title,
        status: TaskStatus.OPEN,
      },
    });

    if (existingTask) {
      console.log(`⏭️  Task already exists: "${taskData.title}"`);
      continue;
    }

    const task = await prisma.task.create({
      data: {
        title: taskData.title,
        description: taskData.description,
        category: taskData.category,
        submissionType: taskData.submissionType,
        reward: taskData.reward,
        deadline,
        type: TaskType.DAILY,
        status: TaskStatus.OPEN,
        creatorId: systemUser.id,
      },
    });

    console.log(`✅ Created task: "${task.title}" (${task.reward} USDC, ${taskData.submissionType})`);
  }

  console.log("\n🎉 Seeding complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
