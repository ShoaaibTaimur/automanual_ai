import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

async function testQueue() {
  console.log('=== AutoManual BullMQ + Redis Queue Test ===');

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

  console.log('1. Connecting to Redis...');
  await connection.ping();
  console.log('   ✓ Redis connection verified.');

  const queueName = 'test-generation-pipeline';
  const queue = new Queue(queueName, { connection });

  console.log('2. Starting test worker...');
  let jobCompleted = false;

  const worker = new Worker(
    queueName,
    async (job) => {
      console.log(`   [Worker] Processing job ${job.id}: ${job.name} for project ${job.data.projectId}`);
      await job.updateProgress(50);
      return { status: 'ok', processedAt: new Date().toISOString() };
    },
    { connection }
  );

  worker.on('completed', (job) => {
    console.log(`   ✓ Job ${job.id} completed successfully.`);
    jobCompleted = true;
  });

  console.log('3. Enqueueing test pipeline job...');
  const testJob = await queue.add('test-stage', { projectId: 'test-project-123' });
  console.log(`   ✓ Job enqueued with ID: ${testJob.id}`);

  // Wait for completion
  let attempts = 0;
  while (!jobCompleted && attempts < 20) {
    await new Promise((r) => setTimeout(r, 200));
    attempts++;
  }

  if (!jobCompleted) {
    throw new Error('Timeout waiting for job completion!');
  }

  await worker.close();
  await queue.close();
  await connection.quit();

  console.log('=== All BullMQ + Redis Tests Passed Successfully! ===');
  process.exit(0);
}

testQueue().catch((err) => {
  console.error('❌ Queue test failed:', err);
  process.exit(1);
});
