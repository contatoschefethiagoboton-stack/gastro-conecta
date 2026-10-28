import { describe, expect, it } from 'vitest';
import { isAdult, isValidCNPJ, isValidCPF, isValidPhoneBR, isValidPixKey, normalizeSocial } from '../shared/validators';
import { mergeContent, textBlocks, contentDefaults } from '../shared/content';
import { buildMysqlConfig } from './gastro/db';

describe('validações de cadastro', () => {
  it('CPF, CNPJ e telefone', () => {
    expect(isValidCPF('529.982.247-25')).toBe(true);
    expect(isValidCPF('111.111.111-11')).toBe(false);
    expect(isValidCNPJ('11.222.333/0001-81')).toBe(true);
    expect(isValidCNPJ('11.222.333/0001-82')).toBe(false);
    expect(isValidPhoneBR('(19) 99398-4529')).toBe(true);
    expect(isValidPhoneBR('(19) 89398-45291')).toBe(false);
  });
  it('Pix, idade e redes sociais', () => {
    expect(isValidPixKey('email', 'pix@exemplo.com')).toBe(true);
    expect(isValidPixKey('cpf', '123')).toBe(false);
    expect(isAdult('2015-05-05', new Date(2026, 0, 1))).toBe(false);
    expect(isAdult('1990-05-05', new Date(2026, 0, 1))).toBe(true);
    expect(normalizeSocial('@meu.buffet', 'instagram')).toBe('https://instagram.com/meu.buffet');
  });
});

describe('conteúdo editável', () => {
  it('ignora chaves desconhecidas e mantém padrões', () => {
    const merged = mergeContent({ 'home.title': 'Novo', 'hack.key': 'x' });
    expect(merged['home.title']).toBe('Novo');
    expect(merged['hack.key']).toBeUndefined();
    expect(merged['contact.region']).toBe(contentDefaults['contact.region']);
  });
  it('converte texto legal em blocos', () => {
    expect(textBlocks('## Título\nLinha 1\n\nParágrafo 2')).toEqual([{ kind: 'h2', text: 'Título' }, { kind: 'p', text: 'Linha 1' }, { kind: 'p', text: 'Parágrafo 2' }]);
  });
});

describe('DATABASE_URL', () => {
  it('liga SSL para bancos na nuvem e decodifica senha', () => {
    const cfg = buildMysqlConfig('mysql://user:p%40ss@gateway01.us-east-1.prod.aws.tidbcloud.com:4000/gastro', {});
    expect(cfg).toMatchObject({ host: 'gateway01.us-east-1.prod.aws.tidbcloud.com', port: 4000, password: 'p@ss', database: 'gastro' });
    expect(cfg.ssl?.rejectUnauthorized).toBe(true);
    expect(buildMysqlConfig('mysql://root:x@localhost/gastro', {}).ssl).toBeUndefined();
  });
});
