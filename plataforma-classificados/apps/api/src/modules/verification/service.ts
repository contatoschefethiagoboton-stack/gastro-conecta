/**
 * Fluxo de verificação (+18):
 *
 *  1. POST /me/verification/start  → cria registro, gera CÓDIGO-DESAFIO e URLs de upload
 *  2. navegador envia documento (frente/verso), selfie e vídeo direto ao bucket privado
 *  3. POST /me/verification/submit → status "processing", job "kyc.analyze" na fila
 *  4. worker chama o provedor (face match, liveness, OCR, autenticidade do documento)
 *  5. regras automáticas: menor de idade = bloqueio imediato; demais → fila de revisão humana
 *  6. moderador aprova → perfil verificado, vídeo de verificação publicado no anúncio
 *
 * Nenhuma verificação é aprovada só pela máquina: sempre há revisão humana.
 */
import { randomInt } from 'node:crypto';
import { env } from '../../config/env.js';
import { pool, tx } from '../../db/pool.js';
import { decrypt } from '../../lib/crypto.js';
import { presignPrivateGet } from '../../lib/storage.js';
import { ageFromBirthDate, onlyDigits } from '../../lib/validators.js';
import { kycProvider } from './providers.js';

const WORDS = ['AZUL', 'LUA', 'SOL', 'MAR', 'RIO', 'FLOR', 'VENTO', 'NUVEM', 'PEDRA', 'FOLHA'];

/** Código que o anunciante mostra num papel e fala no vídeo — impede reuso de vídeos antigos. */
export const generateChallenge = () =>
  `${WORDS[randomInt(WORDS.length)]}-${randomInt(1000, 10000)}-${new Date().toISOString().slice(0, 10)}`;

export async function analyzeVerification(verificationId: string): Promise<void> {
  const { rows } = await pool.query(
    `SELECT iv.*, pd.cpf_enc
       FROM identity_verifications iv
       JOIN advertiser_private_data pd ON pd.user_id = iv.user_id
      WHERE iv.id = $1`,
    [verificationId],
  );
  const v = rows[0];
  if (!v || v.status !== 'processing') return; // idempotente: job repetido não refaz análise

  const result = await kycProvider.analyze({
    verificationId,
    documentType: v.document_type,
    documentFrontUrl: await presignPrivateGet(v.document_front_key, 900),
    documentBackUrl: v.document_back_key ? await presignPrivateGet(v.document_back_key, 900) : undefined,
    selfieUrl: await presignPrivateGet(v.selfie_key, 900),
    videoUrl: await presignPrivateGet(v.video_key, 900),
    challengeCode: v.challenge_code,
  });

  const reasons: string[] = [];
  const docAge = result.documentBirthDate ? ageFromBirthDate(result.documentBirthDate) : null;
  const underage = docAge !== null && docAge < 18;
  if (underage) reasons.push('menor_de_idade');
  if (docAge === null) reasons.push('data_nascimento_ilegivel');
  if (!result.documentAuthentic) reasons.push('documento_nao_autentico');
  if (result.faceMatchScore < env.KYC_FACE_MATCH_MIN) reasons.push('rosto_nao_confere');
  if (result.livenessScore < env.KYC_LIVENESS_MIN) reasons.push('prova_de_vida_falhou');
  if (result.challengeDetected === false) reasons.push('codigo_desafio_ausente');

  let cpfMatches: boolean | null = null;
  if (result.documentCpf) {
    cpfMatches = onlyDigits(result.documentCpf) === decrypt(v.cpf_enc, v.user_id);
    if (!cpfMatches) reasons.push('cpf_divergente');
  }

  const decision = underage ? 'hard_reject' : reasons.length ? 'recommend_reject' : 'recommend_approve';

  await tx(async (c) => {
    await c.query(
      `UPDATE identity_verifications SET
         status = $2, provider = $3, provider_reference = $4,
         face_match_score = $5, liveness_score = $6, document_authentic = $7,
         document_birth_date = $8, document_cpf_matches = $9, challenge_detected = $10,
         auto_decision = $11, auto_reasons = $12,
         rejection_reason = CASE WHEN $11 = 'hard_reject' THEN 'Documento indica menor de 18 anos' END
       WHERE id = $1`,
      [
        verificationId,
        underage ? 'rejected' : 'pending_review',
        kycProvider.name,
        result.providerReference,
        result.faceMatchScore,
        result.livenessScore,
        result.documentAuthentic,
        result.documentBirthDate,
        cpfMatches,
        result.challengeDetected,
        decision,
        reasons,
      ],
    );

    if (underage) {
      // Bloqueio imediato + sinal crítico para a equipe. Preserve evidências (não apague arquivos).
      await c.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [v.user_id]);
      await c.query(`UPDATE advertisements SET status = 'paused_by_admin' WHERE user_id = $1 AND status <> 'removed'`, [v.user_id]);
      await c.query(
        `INSERT INTO fraud_flags (user_id, kind, severity, details) VALUES ($1, 'menor_de_idade', 'critical', $2)`,
        [v.user_id, JSON.stringify({ verificationId, docAge })],
      );
    } else if (cpfMatches === false) {
      await c.query(
        `INSERT INTO fraud_flags (user_id, kind, severity, details) VALUES ($1, 'cpf_divergente', 'high', $2)`,
        [v.user_id, JSON.stringify({ verificationId })],
      );
    }
  });
}
