import { describe, expect, it } from 'vitest';
import { applyPublicSeo } from './publicSeo';
const shell = '<html><head><title>Old</title><meta name="description" content="old"/></head><body><div id="root"></div></body></html>';
describe('conteúdo público e privacidade de rotas',()=>{
 it('entrega texto inicial significativo e título específico',async()=>{const r=await applyPublicSeo(shell,'/sobre');expect(r.status).toBe(200);expect(r.html).toContain('Quem vive a cozinha');expect(r.html).toContain('Criado por quem vive a gastronomia');expect(r.html).not.toContain('<title>Old</title>');});
 it('marca painel privado sem injetar dados de usuário',async()=>{const r=await applyPublicSeo(shell,'/painel');expect(r.html).toContain('noindex,nofollow');expect(r.html).not.toContain('passwordHash');});
 it('home traz contato e dados estruturados do negócio',async()=>{const r=await applyPublicSeo(shell,'/');expect(r.html).toContain('application/ld+json');expect(r.html).toContain('wa.me/5519993984529');expect(r.html).toContain('Campinas e região');});
 it('retorna 404 real para páginas inexistentes',async()=>{const r=await applyPublicSeo(shell,'/pagina-inexistente');expect(r.status).toBe(404);expect(r.html).toContain('noindex,nofollow');});
});
