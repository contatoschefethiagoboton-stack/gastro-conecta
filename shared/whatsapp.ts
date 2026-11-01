// Monta a mensagem no formato exato do modelo aprovado na Meta (lido pela API), para não depender
// de o admin acertar variáveis por número/nome, cabeçalho, botões e idioma.

export type MetaTemplate = {
  name: string;
  language: string;
  status: string;
  parameter_format?: 'POSITIONAL' | 'NAMED';
  components: Array<{ type: string; format?: string; text?: string; buttons?: Array<{ type: string; text?: string; url?: string }> }>;
};
export type TemplateValues = { title: string; text: string; link: string };
type Param = { type: 'text'; text: string; parameter_name?: string };

const VAR_RE = /{{\s*([^}]+?)\s*}}/g;
const varsIn = (text = '') => [...new Set([...text.matchAll(VAR_RE)].map(m => m[1]))];
const clean = (v: string, max: number) => (v.replace(/[\n\t]+/g, ' ').replace(/ {4,}/g, '   ').slice(0, max) || '-');

/** Componentes (corpo, cabeçalho e botões) com os valores do aviso distribuídos nas variáveis do modelo. */
export function buildTemplateComponents(template: MetaTemplate, values: TemplateValues): { components: any[]; error?: string } {
  const named = template.parameter_format === 'NAMED';
  const components: any[] = [];
  const params = (names: string[], list: string[], max: number): Param[] => names.map((name, i) => ({ type: 'text', text: clean(list[i] ?? '-', max), ...(named || !/^\d+$/.test(name) ? { parameter_name: name } : {}) }));
  for (const c of template.components ?? []) {
    const type = c.type.toUpperCase();
    if (type === 'HEADER') {
      if (c.format && c.format.toUpperCase() !== 'TEXT') return { components: [], error: `O modelo tem cabeçalho com ${c.format.toLowerCase() === 'image' ? 'imagem' : c.format.toLowerCase() === 'video' ? 'vídeo' : 'arquivo'}. Use um modelo com cabeçalho de texto fixo ou sem cabeçalho.` };
      const names = varsIn(c.text);
      if (names.length) components.push({ type: 'header', parameters: params(names, [values.title], 60) });
    } else if (type === 'BODY') {
      const names = varsIn(c.text);
      if (!names.length) continue;
      // 3 variáveis: título, texto, link. Menos variáveis: junta o conteúdo para não perder o link.
      const list = names.length >= 3 ? [values.title, values.text, values.link]
        : names.length === 2 ? [values.title, `${values.text} ${values.link}`]
        : [`${values.title} — ${values.text} ${values.link}`];
      components.push({ type: 'body', parameters: params(names, list, 900) });
    } else if (type === 'BUTTONS') {
      (c.buttons ?? []).forEach((b, index) => {
        if (b.type?.toUpperCase() !== 'URL' || !b.url || !varsIn(b.url).length) return;
        const base = b.url.split('{{')[0];
        const suffix = base && values.link.startsWith(base) ? values.link.slice(base.length) : values.link.replace(/^https?:\/\/[^/]+\/?/, '');
        components.push({ type: 'button', sub_type: 'url', index: String(index), parameters: [{ type: 'text', text: clean(suffix || '-', 200) }] });
      });
    }
  }
  return { components };
}

/** Escolhe o modelo certo da lista (mesmo nome; aprovado e no idioma preferido primeiro). */
export function pickTemplate(list: MetaTemplate[], name: string, lang: string): MetaTemplate | null {
  const same = list.filter(t => t.name === name);
  return same.find(t => t.status === 'APPROVED' && t.language === lang) ?? same.find(t => t.status === 'APPROVED') ?? same[0] ?? null;
}

export const TEMPLATE_STATUS: Record<string, string> = { APPROVED: 'Aprovado', PENDING: 'Em análise na Meta', REJECTED: 'Rejeitado pela Meta', PAUSED: 'Pausado', DISABLED: 'Desativado', IN_APPEAL: 'Em recurso' };
