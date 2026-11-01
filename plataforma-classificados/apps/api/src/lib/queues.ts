import { Queue } from 'bullmq';
import { bullConnection } from './redis.js';

const connection = bullConnection();
const defaultJobOptions = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 10_000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

export const queues = {
  kyc: new Queue('kyc', { connection, defaultJobOptions }),
  media: new Queue('media', { connection, defaultJobOptions }),
  billing: new Queue('billing', { connection, defaultJobOptions }),
  notifications: new Queue('notifications', { connection, defaultJobOptions }),
};

export type KycJob = { verificationId: string };
export type MediaJob = { kind: 'ad_media'; mediaId: string } | { kind: 'ppv_item'; itemId: string };
export type NotificationJob =
  | { type: 'ppv.deliver'; purchaseId: string }
  | { type: 'billing.past_due'; userId: string }
  | { type: 'kyc.result'; userId: string; approved: boolean };
