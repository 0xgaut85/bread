import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Update all OPEN tasks to have a new 12-hour deadline
  const newDeadline = new Date();
  newDeadline.setHours(newDeadline.getHours() + 12);
  
  const result = await prisma.task.updateMany({
    where: { status: "OPEN" },
    data: { deadline: newDeadline }
  });
  
  console.log("Updated", result.count, "tasks with new deadline:", newDeadline.toISOString());
  
  // Show all tasks
  const tasks = await prisma.task.findMany({
    select: { id: true, title: true, status: true, deadline: true }
  });
  console.log("All tasks:", JSON.stringify(tasks, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
