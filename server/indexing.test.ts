import { describe, expect, it, beforeEach } from 'vitest';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { googleCredentials, indexNowKey, signServiceAccountJwt } from './gastro/indexing';

describe('indexação', () => {
  beforeEach(() => { delete process.env.GOOGLE_INDEXING_CREDENTIALS; delete process.env.INDEXNOW_KEY; });
  it('assina o JWT da conta de serviço com RS256', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const jwt = signServiceAccountJwt({ client_email: 'robo@projeto.iam.gserviceaccount.com', private_key: pem }, 1_700_000_000);
    const [h, c, sig] = jwt.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
    expect(claims).toMatchObject({ iss: 'robo@projeto.iam.gserviceaccount.com', scope: 'https://www.googleapis.com/auth/indexing', aud: 'https://oauth2.googleapis.com/token', exp: 1_700_003_600 });
    const v = createVerify('RSA-SHA256'); v.update(`${h}.${c}`);
    expect(v.verify(publicKey, Buffer.from(sig, 'base64url'))).toBe(true);
  });
  it('lê as credenciais em JSON ou base64 e a chave do IndexNow', () => {
    const json = JSON.stringify({ client_email: 'a@b.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n' });
    process.env.GOOGLE_INDEXING_CREDENTIALS = json;
    expect(googleCredentials()?.private_key).toContain('\nabc\n');
    process.env.GOOGLE_INDEXING_CREDENTIALS = Buffer.from(json).toString('base64');
    expect(googleCredentials()?.client_email).toBe('a@b.iam.gserviceaccount.com');
    process.env.GOOGLE_INDEXING_CREDENTIALS = 'lixo';
    expect(googleCredentials()).toBeNull();
    process.env.INDEXNOW_KEY = 'abc';
    expect(indexNowKey()).toBeNull();
    process.env.INDEXNOW_KEY = 'a1b2c3d4e5f6a7b8';
    expect(indexNowKey()).toBe('a1b2c3d4e5f6a7b8');
  });
});
