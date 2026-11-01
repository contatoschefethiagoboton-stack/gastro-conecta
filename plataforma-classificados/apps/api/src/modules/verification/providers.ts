/**
 * Adaptadores de verificação de identidade (KYC) e de varredura de segurança de mídia.
 *
 * KYC — provedores com face match + liveness + OCR de documento brasileiro:
 *   idwall, unico (IDCloud), Serpro Datavalid (cruza com a base biométrica do governo),
 *   Veriff, Onfido, Sumsub. Muitos aceitam URLs pré-assinadas em vez do arquivo.
 *
 * Segurança de mídia — hash matching contra bases de abuso sexual infantil (CSAM):
 *   Microsoft PhotoDNA, Thorn Safer, Google Content Safety API. É requisito
 *   inegociável para qualquer site que hospede conteúdo adulto enviado por usuários.
 */
import { env } from '../../config/env.js';

export interface KycInput {
  verificationId: string;
  documentType: 'rg' | 'cnh' | 'passport';
  documentFrontUrl: string;
  documentBackUrl?: string;
  selfieUrl: string;
  videoUrl: string;
  challengeCode: string;
}

export interface KycResult {
  providerReference: string;
  faceMatchScore: number;          // 0..1 — rosto da selfie/vídeo × foto do documento
  livenessScore: number;           // 0..1 — prova de vida (não é foto de foto / deepfake)
  documentAuthentic: boolean;
  documentBirthDate: string | null; // AAAA-MM-DD extraído por OCR
  documentCpf: string | null;
  challengeDetected: boolean | null; // código-desafio visto/ouvido no vídeo
  raw: unknown;
}

export interface KycProvider {
  name: string;
  analyze(input: KycInput): Promise<KycResult>;
}

class MockKycProvider implements KycProvider {
  name = 'mock';
  async analyze(input: KycInput): Promise<KycResult> {
    return {
      providerReference: `mock-${input.verificationId}`,
      faceMatchScore: 0.97,
      livenessScore: 0.95,
      documentAuthentic: true,
      documentBirthDate: '1995-06-15',
      documentCpf: null, // mock não extrai CPF → regra de divergência é ignorada
      challengeDetected: true,
      raw: { mock: true },
    };
  }
}

/** Esqueleto HTTP: adapte o mapeamento de campos ao contrato do provedor escolhido. */
class HttpKycProvider implements KycProvider {
  name = 'http';
  async analyze(input: KycInput): Promise<KycResult> {
    const res = await fetch(`${env.KYC_API_URL}/v1/verifications`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.KYC_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reference: input.verificationId,
        document: { type: input.documentType, front: input.documentFrontUrl, back: input.documentBackUrl },
        selfie: input.selfieUrl,
        video: input.videoUrl,
        liveness: { challenge_phrase: input.challengeCode },
        country: 'BR',
      }),
    });
    if (!res.ok) throw new Error(`KYC HTTP ${res.status}: ${await res.text()}`);
    const d = (await res.json()) as Record<string, any>;
    return {
      providerReference: String(d.id),
      faceMatchScore: Number(d.face_match?.score ?? 0),
      livenessScore: Number(d.liveness?.score ?? 0),
      documentAuthentic: Boolean(d.document?.authentic),
      documentBirthDate: d.document?.birth_date ?? null,
      documentCpf: d.document?.cpf ?? null,
      challengeDetected: d.liveness?.challenge_matched ?? null,
      raw: d,
    };
  }
}

export const kycProvider: KycProvider = env.KYC_PROVIDER === 'http' ? new HttpKycProvider() : new MockKycProvider();

// -----------------------------------------------------------------------------

export interface SafetyScanResult {
  status: 'clean' | 'flagged';
  matchedList?: string;   // ex.: "NCMEC", "IWF"
  raw?: unknown;
}

export interface SafetyScanner {
  scan(input: { buffer: Buffer; mimeType: string; sha256Hex: string }): Promise<SafetyScanResult>;
}

class MockSafetyScanner implements SafetyScanner {
  async scan(): Promise<SafetyScanResult> {
    return { status: 'clean' };
  }
}

class HttpSafetyScanner implements SafetyScanner {
  async scan(input: { buffer: Buffer; mimeType: string; sha256Hex: string }): Promise<SafetyScanResult> {
    const res = await fetch(`${env.SAFETY_API_URL}/v1/match`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.SAFETY_API_KEY}`, 'Content-Type': input.mimeType },
      body: new Uint8Array(input.buffer),
    });
    if (!res.ok) throw new Error(`Safety HTTP ${res.status}`);
    const d = (await res.json()) as { is_match?: boolean; list?: string };
    return { status: d.is_match ? 'flagged' : 'clean', matchedList: d.list, raw: d };
  }
}

export const safetyScanner: SafetyScanner = env.SAFETY_SCANNER === 'http' ? new HttpSafetyScanner() : new MockSafetyScanner();
