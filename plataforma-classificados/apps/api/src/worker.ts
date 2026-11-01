/**
 * Processo de background (Render "Background Worker"):
 *  - kyc:           análise de verificação de identidade
 *  - media:         varredura/hash de fotos, vídeos e conteúdo PPV
 *  - billing:       varredura periódica de assinaturas (degustação, inadimplência)
 *  - notifications: e-mails/WhatsApp transacionais
 */
import { Worker } from 'bullmq';
import { pool, tx } from './db/pool.js';
import { processAdMedia, processPpvItem } from './jobs/media.js';
import { decrypt } from './lib/crypto.js';
import { type KycJob, type MediaJob, type NotificationJob, queues } from './lib/queues.js';
import { bullConnection } from './lib/redis.js';
import { billingSweep } from './modules/payments/service.js';
import { buildAccessToken } from './modules/ppv/service.js';
import { analyzeVerification } from './modules/verification/service.js';

const connection = bullConnection();

const workers = [
  new Worker<KycJob>('kyc', async (job) => analyzeVerification(job.data.verificationId), { connection, concurrency: 4 }),

  new Worker<MediaJob>(
    'media',
    async (job) => (job.data.kind === 'ad_media' ? processAdMedia(job.data.mediaId) : processPpvItem(job.data.itemId)),
    { connection, concurrency: 4 },
  ),

  new Worker('billing', async () => tx((c) => billingSweep(c)), { connection, concurrency: 1 }),

  new Worker<NotificationJob>(
    'notifications',
    async (job) => {
      const n = job.data;
      if (n.type === 'ppv.deliver') {
        const p = (await pool.query('SELECT id, buyer_email_enc FROM ppv_purchases WHERE id = $1', [n.purchaseId])).rows[0];
        if (!p) return;
        const email = decrypt(p.buyer_email_enc, p.id);
        const link = `${process.env.WEB_PUBLIC_URL ?? ''}/conteudo/${buildAccessToken(p.id)}`;
        // Integre aqui seu provedor de e-mail transacional (confirme a política para conteúdo adulto).
        // Assunto e corpo DISCRETOS: sem nome do site explícito nem conteúdo sensível.
        job.log(`e-mail de acesso PPV para ${email.replace(/(.).+(@.*)/, '$1***$2')}: ${link.slice(0, 40)}...`);
      } else {
        job.log(`notificação ${n.type} para ${n.userId}`);
      }
    },
    { connection, concurrency: 8 },
  ),
];

for (const w of workers) {
  w.on('failed', (job, err) => console.error(`[worker:${w.name}] job ${job?.id} falhou:`, err.message));
}

// Agenda a varredura de cobrança a cada 10 minutos (idempotente: upsert do agendamento)
await queues.billing.upsertJobScheduler('billing-sweep', { every: 10 * 60_000 }, { name: 'sweep' });
console.log('[worker] iniciado');

const shutdown = async () => {
  await Promise.all(workers.map((w) => w.close()));
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
