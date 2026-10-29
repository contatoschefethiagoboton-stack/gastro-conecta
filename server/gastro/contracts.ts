// Contrato de prestação de serviços gerado automaticamente quando o cliente aceita uma proposta.
import { SCOPE_LABELS, type ContractScope } from "@shared/services";
import { formatCEP, formatCNPJ, formatCPF, formatPhone } from "@shared/validators";
import { buildPdf, type PdfBlock } from "./pdf";
import { isoDate } from "./rules";

export type Party = { name: string; document: string; documentLabel: string; address: string; email: string; phone: string };
export type ContractPayload = {
  version: 2;
  number: string;
  acceptedAt: string;
  acceptedIp: string;
  client: Party & { userId: number };
  provider: Party & { userId: number; companyType?: string; pix: string; bank: string };
  event: { id: number; title: string; type: string; date: string; time: string; city: string; location: string; guests: number; description: string };
  scope: ContractScope;
  amountCents: number;
  paymentTerms: string;
  proposalMessage: string;
};

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const brDate = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split("-").reverse().join("/") : value || "a definir");

export function formatAddress(d: any): string {
  if (!d) return "";
  return [d.street && `${d.street}, ${d.number ?? "s/n"}`, d.complement, d.district, d.city && `${d.city}/${d.state ?? ""}`, d.cep && `CEP ${formatCEP(d.cep)}`].filter(Boolean).join(" - ");
}

export function formatDocument(doc: string | undefined) {
  const digits = String(doc ?? "").replace(/\D/g, "");
  return digits.length === 14 ? formatCNPJ(digits) : digits.length === 11 ? formatCPF(digits) : digits;
}

const PIX_LABEL: Record<string, string> = { cpf: "CPF", cnpj: "CNPJ", email: "E-mail", telefone: "Celular", aleatoria: "Chave aleatória" };

export function buildContractPayload(input: {
  contractNumber: string; acceptedAt: Date; acceptedIp: string;
  client: { userId: number; name: string; email: string; details: any };
  provider: { userId: number; name: string; email: string; details: any };
  event: any; proposal: any;
}): ContractPayload {
  const c = input.client.details ?? {};
  const p = input.provider.details ?? {};
  const providerDocIsCnpj = p.documentType === "cnpj";
  const bank = p.bank ?? {};
  return {
    version: 2,
    number: input.contractNumber,
    acceptedAt: input.acceptedAt.toISOString(),
    acceptedIp: input.acceptedIp,
    client: { userId: input.client.userId, name: c.fullName || input.client.name, document: formatDocument(c.cpf), documentLabel: "CPF", address: formatAddress(c), email: input.client.email, phone: c.phone ? formatPhone(c.phone) : "" },
    provider: {
      userId: input.provider.userId,
      name: providerDocIsCnpj ? `${p.companyName || p.tradeName || input.provider.name}${p.fullName ? ` (responsável: ${p.fullName})` : ""}` : p.fullName || input.provider.name,
      document: formatDocument(providerDocIsCnpj ? p.cnpj : p.cpf),
      documentLabel: providerDocIsCnpj ? "CNPJ" : "CPF",
      companyType: providerDocIsCnpj ? p.companyType : undefined,
      address: formatAddress(p),
      email: input.provider.email,
      phone: p.phone ? formatPhone(p.phone) : "",
      pix: bank.pixKey ? `${PIX_LABEL[bank.pixKeyType] ?? bank.pixKeyType}: ${bank.pixKey}` : "",
      bank: bank.bankName ? `${bank.bankName} - Ag. ${bank.agency} - Conta ${bank.account} (${bank.accountType}) - Titular: ${bank.holderName} (${formatDocument(bank.holderDocument)})` : "",
    },
    event: {
      id: Number(input.event.id), title: input.event.title, type: input.event.type,
      date: isoDate(input.event.eventDate) ?? "", time: input.proposal.eventTime || input.event.eventTime || "",
      city: input.event.city, location: input.event.location ?? "", guests: Number(input.event.guests), description: input.event.description ?? "",
    },
    scope: input.proposal.scope === "full" ? "full" : "labor",
    amountCents: Number(input.proposal.amountCents),
    paymentTerms: input.proposal.paymentTerms || "Pagamento integral diretamente ao CONTRATADO, via Pix, até a data do serviço.",
    proposalMessage: input.proposal.message ?? "",
  };
}

export function contractBlocks(c: ContractPayload): PdfBlock[] {
  const partyBlocks = (label: string, party: Party, extra: PdfBlock[] = []): PdfBlock[] => [
    { kind: "heading", text: label },
    { kind: "pair", label: "Nome / razão social", value: party.name },
    { kind: "pair", label: party.documentLabel, value: party.document },
    { kind: "pair", label: "Endereço", value: party.address },
    { kind: "pair", label: "E-mail", value: party.email },
    { kind: "pair", label: "Telefone", value: party.phone },
    ...extra,
  ];
  const included = c.scope === "full"
    ? "O CONTRATADO fornecerá a mão de obra e também louças, pratos, talheres, copos, utensílios e equipamentos de cozinha e os ingredientes necessários, conforme a proposta aceita."
    : "O CONTRATADO fornecerá somente a mão de obra. Louças, pratos, talheres, copos, utensílios de cozinha, ingredientes e demais insumos são de responsabilidade do CONTRATANTE, salvo acordo diferente registrado na proposta.";
  return [
    { kind: "title", text: `CONTRATO DE PRESTAÇÃO DE SERVIÇOS Nº ${c.number}` },
    { kind: "text", text: "Pelo presente instrumento particular, as partes abaixo qualificadas celebram este contrato, intermediado pela plataforma GastroConecta, mediante as cláusulas a seguir." },
    ...partyBlocks("CONTRATANTE", c.client),
    ...partyBlocks("CONTRATADO", c.provider, [
      ...(c.provider.companyType ? [{ kind: "pair" as const, label: "Natureza", value: c.provider.companyType }] : []),
      { kind: "pair", label: "Chave Pix para recebimento", value: c.provider.pix },
      { kind: "pair", label: "Dados bancários", value: c.provider.bank },
    ]),
    { kind: "heading", text: "CLÁUSULA 1 - OBJETO" },
    { kind: "text", text: `Prestação de serviço de "${c.event.type}" para o evento "${c.event.title}", para aproximadamente ${c.event.guests} pessoa(s).${c.event.description ? ` Detalhes do pedido: ${c.event.description}` : ""}` },
    ...(c.proposalMessage ? [{ kind: "text" as const, text: `Proposta aceita: ${c.proposalMessage}` }] : []),
    { kind: "heading", text: "CLÁUSULA 2 - ESCOPO" },
    { kind: "pair", label: "Modalidade", value: SCOPE_LABELS[c.scope] },
    { kind: "text", text: included },
    { kind: "heading", text: "CLÁUSULA 3 - DATA, HORÁRIO E LOCAL" },
    { kind: "pair", label: "Data", value: brDate(c.event.date) },
    { kind: "pair", label: "Horário", value: c.event.time || "a combinar entre as partes" },
    { kind: "pair", label: "Local", value: [c.event.location, c.event.city].filter(Boolean).join(" - ") },
    { kind: "heading", text: "CLÁUSULA 4 - VALOR E FORMA DE PAGAMENTO" },
    { kind: "pair", label: "Valor total acordado", value: money(c.amountCents) },
    { kind: "pair", label: "Condições de pagamento", value: c.paymentTerms },
    { kind: "text", text: "O pagamento é feito diretamente ao CONTRATADO, na chave Pix ou conta indicada acima. A GastroConecta não retém comissão, não recebe valores em nome das partes e não é responsável pelo repasse." },
    { kind: "heading", text: "CLÁUSULA 5 - OBRIGAÇÕES DO CONTRATADO" },
    { kind: "text", text: "Executar o serviço com qualidade, higiene e segurança alimentar, nos termos da proposta; comparecer no horário combinado com a equipe e os materiais de sua responsabilidade; zelar pelo local e pelos bens do CONTRATANTE; cumprir as obrigações fiscais, trabalhistas e previdenciárias relativas à sua equipe." },
    { kind: "heading", text: "CLÁUSULA 6 - OBRIGAÇÕES DO CONTRATANTE" },
    { kind: "text", text: "Efetuar o pagamento nas condições acordadas; garantir o acesso ao local, água, energia e a estrutura combinada; fornecer os itens de sua responsabilidade conforme a Cláusula 2; informar com antecedência restrições alimentares e alterações no número de convidados." },
    { kind: "heading", text: "CLÁUSULA 7 - ALTERAÇÕES E CANCELAMENTO" },
    { kind: "text", text: "Alterações de data, horário, escopo ou número de convidados dependem de acordo por escrito entre as partes e podem alterar o valor. O cancelamento por qualquer das partes deve ser comunicado por escrito com a maior antecedência possível. Cancelamentos com menos de 7 (sete) dias da data do serviço autorizam a retenção ou o reembolso das despesas comprovadamente realizadas, além de multa de 20% do valor total em favor da parte prejudicada, salvo caso fortuito ou força maior." },
    { kind: "heading", text: "CLÁUSULA 8 - PAPEL DA PLATAFORMA" },
    { kind: "text", text: "A GastroConecta atua apenas como intermediadora tecnológica entre CONTRATANTE e CONTRATADO e não é parte deste contrato, não presta o serviço e não responde por sua execução, pagamento ou eventuais danos." },
    { kind: "heading", text: "CLÁUSULA 9 - ACEITE ELETRÔNICO" },
    { kind: "text", text: `Este contrato foi gerado a partir da proposta enviada pelo CONTRATADO e aceita eletronicamente pelo CONTRATANTE em ${new Date(c.acceptedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (horário de Brasília), na conta autenticada nº ${c.client.userId}, IP ${c.acceptedIp || "não registrado"}. As partes reconhecem a validade deste meio de comprovação de autoria e integridade, nos termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001, e do art. 107 do Código Civil.` },
    { kind: "heading", text: "CLÁUSULA 10 - FORO" },
    { kind: "text", text: `Fica eleito o foro da comarca de ${c.event.city || "domicílio do CONTRATANTE"} para dirimir dúvidas oriundas deste contrato.` },
    { kind: "space" },
    { kind: "signature", label: `CONTRATANTE: ${c.client.name} (${c.client.documentLabel} ${c.client.document})` },
    { kind: "signature", label: `CONTRATADO: ${c.provider.name} (${c.provider.documentLabel} ${c.provider.document})` },
  ];
}

export function contractPdf(payload: ContractPayload): Buffer {
  return buildPdf(contractBlocks(payload), `GastroConecta - Contrato ${payload.number}`);
}

/** Contratos antigos (minutas A/B/C da versão anterior): exibidos como texto simples. */
export function legacyContractPdf(title: string, payload: Record<string, unknown>): Buffer {
  return buildPdf([{ kind: "title", text: title }, ...Object.entries(payload).map(([label, value]) => ({ kind: "pair" as const, label, value: typeof value === "string" ? value : JSON.stringify(value) }))], "GastroConecta");
}
