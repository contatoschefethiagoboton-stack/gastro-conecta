import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Camera, Check, ImagePlus, Loader2, Upload, X, Building2, UserRound, Landmark, MapPin, Share2, BriefcaseBusiness, CircleAlert, ScanFace } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { uploadFile, type MediaKind } from '@/lib/upload';
import { SERVICE_GROUPS, SERVICE_TYPES } from '@shared/services';
import { formatCEP, formatCNPJ, formatCPF, formatPhone, isValidCEP, isValidCNPJ, isValidCPF, isValidHttpUrl, isValidPhoneBR, isValidPixKey, onlyDigits, PIX_KEY_TYPES, UFS, type PixKeyType } from '@shared/validators';
import '../admin.css';

type Media = { id: number; url: string; name?: string };
type Address = { cep: string; street: string; number: string; complement: string; district: string; city: string; state: string };
type Bank = { holderName: string; holderDocument: string; bankName: string; bankCode: string; agency: string; account: string; accountType: 'corrente' | 'poupanca' | 'pagamento'; pixKeyType: PixKeyType; pixKey: string };
type OnboardingResponse = { accountType: 'client' | 'provider'; status: string; email: string; name: string; details: any; completedAt: string | null; minServicePhotos?: number };

const emptyAddress: Address = { cep: '', street: '', number: '', complement: '', district: '', city: '', state: 'SP' };
const emptyBank: Bank = { holderName: '', holderDocument: '', bankName: '', bankCode: '', agency: '', account: '', accountType: 'corrente', pixKeyType: 'cpf', pixKey: '' };
const BANKS = ['Nubank', 'Itaú', 'Bradesco', 'Banco do Brasil', 'Caixa Econômica Federal', 'Santander', 'Banco Inter', 'C6 Bank', 'PicPay', 'Mercado Pago', 'Sicoob', 'Sicredi', 'PagBank', 'BTG Pactual'];

function errorText(error: unknown) { return error instanceof Error ? error.message : 'Não foi possível concluir.'; }

function Section({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: string; children: ReactNode }) {
  return <section className="ob-section"><header><span className="ob-section-icon">{icon}</span><div><h3>{title}</h3>{hint && <p>{hint}</p>}</div></header><div className="ob-section-body">{children}</div></section>;
}

function Input({ label, value, onChange, placeholder, type = 'text', required, maxLength, inputMode, autoComplete, error, wide }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean; maxLength?: number; inputMode?: 'numeric' | 'tel' | 'email' | 'text' | 'url'; autoComplete?: string; error?: string; wide?: boolean }) {
  return <label className={`ob-field ${wide ? 'ob-wide' : ''} ${error ? 'has-error' : ''}`}><span>{label}{required && <i aria-hidden="true"> *</i>}</span><input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required} maxLength={maxLength} inputMode={inputMode} autoComplete={autoComplete}/>{error && <small>{error}</small>}</label>;
}

function AddressFields({ value, onChange, errors }: { value: Address; onChange: (a: Address) => void; errors: Record<string, string> }) {
  const set = (key: keyof Address, v: string) => onChange({ ...value, [key]: v });
  const lookup = async (cep: string) => {
    const digits = onlyDigits(cep);
    if (digits.length !== 8) return;
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await response.json();
      if (data && !data.erro) onChange({ ...value, cep: formatCEP(digits), street: data.logradouro || value.street, district: data.bairro || value.district, city: data.localidade || value.city, state: data.uf || value.state });
    } catch { /* preenchimento automático é só conveniência */ }
  };
  return <div className="ob-grid">
    <label className={`ob-field ${errors.cep ? 'has-error' : ''}`}><span>CEP<i> *</i></span><input value={value.cep} inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" onChange={e => { const v = formatCEP(e.target.value); set('cep', v); if (onlyDigits(v).length === 8) void lookup(v); }}/>{errors.cep && <small>{errors.cep}</small>}</label>
    <Input wide label="Rua / avenida" required value={value.street} onChange={v => set('street', v)} autoComplete="address-line1" error={errors.street}/>
    <Input label="Número" required value={value.number} onChange={v => set('number', v)} maxLength={20} error={errors.number}/>
    <Input label="Complemento" value={value.complement} onChange={v => set('complement', v)} maxLength={80}/>
    <Input label="Bairro" required value={value.district} onChange={v => set('district', v)} error={errors.district}/>
    <Input label="Cidade" required value={value.city} onChange={v => set('city', v)} autoComplete="address-level2" error={errors.city}/>
    <label className="ob-field"><span>UF<i> *</i></span><select value={value.state} onChange={e => set('state', e.target.value)}>{UFS.map(uf => <option key={uf}>{uf}</option>)}</select></label>
  </div>;
}

function addressErrors(a: Address) {
  const e: Record<string, string> = {};
  if (!isValidCEP(a.cep)) e.cep = 'CEP inválido';
  if (a.street.trim().length < 2) e.street = 'Informe a rua';
  if (!a.number.trim()) e.number = 'Informe o número';
  if (a.district.trim().length < 2) e.district = 'Informe o bairro';
  if (a.city.trim().length < 2) e.city = 'Informe a cidade';
  return e;
}

function UploadButton({ kind, accept, multiple, capture, onUploaded, children, className, disabled }: { kind: MediaKind; accept: string; multiple?: boolean; capture?: boolean; onUploaded: (m: Media) => void; children: ReactNode; className?: string; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const media = await uploadFile(file, kind);
        onUploaded({ id: media.id, url: media.url, name: file.name });
      }
    } catch (error) { toast.error(errorText(error)); }
    finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };
  return <><button type="button" className={className} disabled={busy || disabled} onClick={() => ref.current?.click()}>{busy ? <Loader2 className="ob-spin" size={18}/> : null}{children}</button><input ref={ref} type="file" hidden accept={accept} multiple={multiple} {...(capture ? { capture: "user" as const } : {})} onChange={e => void pick(e.target.files)}/></>;
}

function FacePhoto({ value, onChange, error }: { value: Media | null; onChange: (m: Media) => void; error?: string }) {
  return <Section icon={<ScanFace size={18}/>} title="Foto do rosto (verificação de identidade)" hint="Tire uma selfie nítida, de frente, com boa luz e sem óculos escuros, boné ou filtro. É privada: só a administração vê, para evitar perfis falsos.">
    <div className="ob-avatar-row">
      <div className="ob-avatar ob-face">{value ? <img src={value.url} alt="Foto do rosto"/> : <ScanFace size={34}/>}</div>
      <div className="ob-avatar-actions">
        <UploadButton kind="face" accept="image/*" capture className="ob-btn ob-btn-outline" onUploaded={onChange}><Camera size={16}/> {value ? 'Trocar foto' : 'Tirar / enviar foto'}</UploadButton>
        {error && <small className="ob-error-text">{error}</small>}
      </div>
    </div>
  </Section>;
}

export default function Onboarding({ mode, onDone }: { mode: 'required' | 'edit'; onDone?: () => void }) {
  const [data, setData] = useState<OnboardingResponse | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState<Address>(emptyAddress);
  const [face, setFace] = useState<Media | null>(null);
  const [cpf, setCpf] = useState('');
  // profissional
  const [documentType, setDocumentType] = useState<'cpf' | 'cnpj'>('cpf');
  const [cnpj, setCnpj] = useState('');
  const [companyType, setCompanyType] = useState<'MEI' | 'Limitada' | 'SLU' | 'Outro'>('MEI');
  const [companyName, setCompanyName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [services, setServices] = useState<string[]>([]);
  const [specialty, setSpecialty] = useState('');
  const [bio, setBio] = useState('');
  const [priceFrom, setPriceFrom] = useState('');
  const [logo, setLogo] = useState<Media | null>(null);
  const [photos, setPhotos] = useState<Media[]>([]);
  const [bank, setBank] = useState<Bank>(emptyBank);
  const [socials, setSocials] = useState({ instagram: '', facebook: '', tiktok: '', youtube: '', linkedin: '' });
  const [website, setWebsite] = useState('');

  useEffect(() => {
    api<OnboardingResponse>('/onboarding').then(response => {
      setData(response);
      const d = response.details;
      setFullName(d?.fullName ?? response.name ?? '');
      if (!d) return;
      setPhone(formatPhone(d.phone ?? ''));
      setAddress({ cep: formatCEP(d.cep ?? ''), street: d.street ?? '', number: d.number ?? '', complement: d.complement ?? '', district: d.district ?? '', city: d.city ?? '', state: d.state ?? 'SP' });
      if (d.faceMediaId && d.faceUrl) setFace({ id: d.faceMediaId, url: d.faceUrl });
      setCpf(formatCPF(d.cpf ?? ''));
      if (response.accountType !== 'provider') return;
      setDocumentType(d.documentType === 'cnpj' || (!d.documentType && d.cnpj) ? 'cnpj' : 'cpf');
      setCnpj(formatCNPJ(d.cnpj ?? '')); setCompanyName(d.companyName ?? ''); setTradeName(d.tradeName ?? '');
      if (d.companyType) setCompanyType(d.companyType);
      setServices(Array.isArray(d.services) ? d.services : []);
      setSpecialty(d.specialty ?? ''); setBio(d.bio ?? d.experience ?? ''); setPriceFrom(d.priceFrom ? String(d.priceFrom) : '');
      if (d.avatarMediaId && d.avatarUrl) setLogo({ id: d.avatarMediaId, url: d.avatarUrl });
      setPhotos(Array.isArray(d.serviceUrls) ? d.serviceUrls : []);
      if (d.bank) setBank({ ...emptyBank, ...d.bank, holderDocument: d.bank.holderDocument?.length === 14 ? formatCNPJ(d.bank.holderDocument) : formatCPF(d.bank.holderDocument ?? '') });
      setSocials({ instagram: '', facebook: '', tiktok: '', youtube: '', linkedin: '', ...(d.socials ?? {}) }); setWebsite(d.website ?? '');
    }).catch(error => setLoadError(errorText(error)));
  }, []);

  if (loadError) return <div className="ob-shell"><div className="ob-alert ob-alert-error"><CircleAlert size={18}/> {loadError}</div></div>;
  if (!data) return <div className="ob-shell"><div className="ob-loading"><Loader2 className="ob-spin" size={22}/> Carregando seu cadastro…</div></div>;
  const isClient = data.accountType === 'client';
  const minPhotos = data.minServicePhotos ?? 3;

  const validate = () => {
    const e: Record<string, string> = { ...addressErrors(address) };
    if (fullName.trim().length < 5) e.fullName = 'Informe o nome completo';
    if (!isValidPhoneBR(phone)) e.phone = 'Telefone com DDD inválido';
    if (!face) e.face = 'Envie a foto do seu rosto';
    if (isClient || documentType === 'cpf') { if (!isValidCPF(cpf)) e.cpf = 'CPF inválido'; }
    if (!isClient) {
      if (documentType === 'cnpj') {
        if (!isValidCNPJ(cnpj)) e.cnpj = 'CNPJ inválido';
        if (companyName.trim().length < 3) e.companyName = 'Informe a razão social';
      }
      if (!services.length) e.services = 'Escolha pelo menos um serviço';
      if (specialty.trim().length < 2) e.specialty = 'Informe sua especialidade';
      if (bio.trim().length < 30) e.bio = 'Apresente seu trabalho (mínimo 30 caracteres)';
      if (!logo) e.logo = 'Envie sua logo ou foto de perfil';
      if (photos.length < minPhotos) e.photos = `Envie pelo menos ${minPhotos} fotos (faltam ${minPhotos - photos.length})`;
      if (bank.holderName.trim().length < 3) e.holderName = 'Informe o titular';
      if (!isValidCPF(bank.holderDocument) && !isValidCNPJ(bank.holderDocument)) e.holderDocument = 'CPF/CNPJ do titular inválido';
      if (bank.bankName.trim().length < 2) e.bankName = 'Informe o banco';
      if (!/^\d{3,5}(-?[\dXx])?$/.test(bank.agency.trim())) e.agency = 'Agência inválida';
      if (!/^\d{3,15}(-?[\dXx])?$/.test(bank.account.trim())) e.account = 'Conta inválida';
      if (!isValidPixKey(bank.pixKeyType, bank.pixKey)) e.pixKey = 'Chave Pix inválida para o tipo escolhido';
      if (website.trim() && !isValidHttpUrl(website)) e.website = 'Use o endereço completo (https://...)';
    }
    setErrors(e);
    return e;
  };

  const save = async () => {
    const e = validate();
    if (Object.keys(e).length) { toast.error('Revise os campos destacados.'); setTimeout(() => document.querySelector('.has-error, .ob-error-text')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); return; }
    setSaving(true);
    try {
      const common = { fullName: fullName.trim(), phone, ...address, faceMediaId: face!.id };
      const payload = isClient
        ? { ...common, cpf }
        : { ...common, documentType, cpf: documentType === 'cpf' ? cpf : '', cnpj: documentType === 'cnpj' ? cnpj : '', ...(documentType === 'cnpj' ? { companyType } : {}), companyName: companyName.trim(), tradeName: tradeName.trim(), services, specialty: specialty.trim(), bio: bio.trim(), priceFrom: Math.max(0, Math.round(Number(priceFrom.replace(',', '.')) || 0)), avatarMediaId: logo!.id, serviceMediaIds: photos.map(p => p.id), bank: { ...bank, holderName: bank.holderName.trim(), bankName: bank.bankName.trim(), agency: bank.agency.trim(), account: bank.account.trim(), pixKey: bank.pixKey.trim() }, socials, website: website.trim() };
      await api('/onboarding', { method: 'PUT', body: JSON.stringify(payload) });
      toast.success(isClient ? 'Dados salvos. Você já pode aceitar propostas.' : mode === 'required' ? 'Cadastro enviado! Agora é só aguardar a aprovação.' : 'Cadastro atualizado.');
      onDone?.();
    } catch (error) { toast.error(errorText(error)); }
    finally { setSaving(false); }
  };

  const err = (key: string) => errors[key] ? <small className="ob-error-text">{errors[key]}</small> : null;
  const toggleService = (id: string) => setServices(list => list.includes(id) ? list.filter(s => s !== id) : [...list, id]);

  return <div className="ob-shell">
    <div className="ob-intro">
      <span className="ob-kicker">{isClient ? 'Dados para o contrato' : 'Cadastro de profissional'}</span>
      <h2>{isClient ? 'Seus dados para fechar com segurança.' : mode === 'required' ? 'Complete seu cadastro para começar.' : 'Seus dados de cadastro.'}</h2>
      <p>{isClient ? 'Estes dados entram no contrato gerado quando você aceitar uma proposta. Não aparecem no site.' : 'Com logo, fotos dos seus trabalhos, documento e Pix, seu perfil aparece no catálogo e você recebe pedidos da sua região. Você recebe 100% do valor negociado, direto no seu Pix.'}</p>
      {!isClient && data.status === 'pending' && <div className="ob-alert"><CircleAlert size={17}/> Depois de enviar, a administração confere seus dados e foto. Com a aprovação, ative a assinatura mensal (Pix) para ficar visível e enviar propostas.</div>}
    </div>

    {!isClient && <Section icon={<Camera size={18}/>} title="Logo ou foto de perfil" hint="Aparece no catálogo para os clientes.">
      <div className="ob-avatar-row">
        <div className="ob-avatar">{logo ? <img src={logo.url} alt="Logo"/> : <UserRound size={34}/>}</div>
        <div className="ob-avatar-actions">
          <UploadButton kind="avatar" accept="image/*" className="ob-btn ob-btn-outline" onUploaded={m => setLogo(m)}><Upload size={16}/> {logo ? 'Trocar logo' : 'Enviar logo'}</UploadButton>
          {err('logo')}
        </div>
      </div>
    </Section>}

    <FacePhoto value={face} onChange={setFace} error={errors.face}/>

    {isClient ? <>
      <Section icon={<UserRound size={18}/>} title="Dados pessoais">
        <div className="ob-grid">
          <Input wide label="Nome completo" required value={fullName} onChange={setFullName} autoComplete="name" error={errors.fullName}/>
          <Input label="CPF" required value={cpf} onChange={v => setCpf(formatCPF(v))} inputMode="numeric" placeholder="000.000.000-00" error={errors.cpf}/>
          <Input label="Celular / WhatsApp" required value={phone} onChange={v => setPhone(formatPhone(v))} inputMode="tel" autoComplete="tel" placeholder="(19) 99999-9999" error={errors.phone}/>
        </div>
      </Section>
      <Section icon={<MapPin size={18}/>} title="Endereço"><AddressFields value={address} onChange={setAddress} errors={errors}/></Section>
    </> : <>
      <Section icon={<Building2 size={18}/>} title="Documento" hint="Você pode se cadastrar como pessoa física (CPF) ou empresa (CNPJ — MEI ou Limitada).">
        <div className="ob-chips" role="radiogroup" aria-label="Tipo de documento">
          {(['cpf', 'cnpj'] as const).map(t => <button type="button" key={t} role="radio" aria-checked={documentType === t} className={documentType === t ? 'is-on' : ''} onClick={() => setDocumentType(t)}>{documentType === t && <Check size={14}/>} {t === 'cpf' ? 'Pessoa física (CPF)' : 'Empresa (CNPJ)'}</button>)}
        </div>
        <div className="ob-grid">
          <Input wide label="Nome completo" required value={fullName} onChange={setFullName} autoComplete="name" error={errors.fullName}/>
          {documentType === 'cpf' ? <Input label="CPF" required value={cpf} onChange={v => setCpf(formatCPF(v))} inputMode="numeric" placeholder="000.000.000-00" error={errors.cpf}/> : <>
            <Input label="CNPJ" required value={cnpj} onChange={v => setCnpj(formatCNPJ(v))} inputMode="numeric" placeholder="00.000.000/0000-00" error={errors.cnpj}/>
            <label className="ob-field"><span>Tipo de empresa<i> *</i></span><select value={companyType} onChange={e => setCompanyType(e.target.value as typeof companyType)}><option value="MEI">MEI</option><option value="Limitada">Limitada (Ltda.)</option><option value="SLU">Sociedade Limitada Unipessoal (SLU)</option><option value="Outro">Outro</option></select></label>
            <Input wide label="Razão social" required value={companyName} onChange={setCompanyName} error={errors.companyName}/>
          </>}
          <Input wide label="Nome comercial (aparece no catálogo)" value={tradeName} onChange={setTradeName} placeholder="Ex.: Chef Ana Gastronomia"/>
          <Input label="Celular / WhatsApp" required value={phone} onChange={v => setPhone(formatPhone(v))} inputMode="tel" autoComplete="tel" placeholder="(19) 99999-9999" error={errors.phone}/>
        </div>
      </Section>
      <Section icon={<MapPin size={18}/>} title="Endereço" hint="O endereço completo não aparece no site; só cidade e estado."><AddressFields value={address} onChange={setAddress} errors={errors}/></Section>
      <Section icon={<BriefcaseBusiness size={18}/>} title="Serviços que você oferece">
        {SERVICE_GROUPS.map(group => <div key={group} className="ob-service-group"><strong>{group}</strong><div className="ob-chips">{SERVICE_TYPES.filter(s => s.group === group).map(s => <button type="button" key={s.id} className={services.includes(s.id) ? 'is-on' : ''} onClick={() => toggleService(s.id)}>{services.includes(s.id) && <Check size={14}/>} {s.label}</button>)}</div></div>)}
        {err('services')}
        <div className="ob-grid">
          <Input wide label="Especialidade" required value={specialty} onChange={setSpecialty} placeholder="Ex.: cozinha italiana, marmitas fit, limpeza pós-obra" error={errors.specialty}/>
          <Input label="A partir de (R$, opcional)" value={priceFrom} onChange={v => setPriceFrom(v.replace(/[^\d,.]/g, ''))} inputMode="numeric" placeholder="Ex.: 150"/>
          <label className={`ob-field ob-wide ${errors.bio ? 'has-error' : ''}`}><span>Apresentação<i> *</i></span><textarea rows={4} maxLength={3000} value={bio} onChange={e => setBio(e.target.value)} placeholder="Conte sua experiência, estilo de trabalho e os serviços que você atende."/>{errors.bio && <small>{errors.bio}</small>}</label>
        </div>
      </Section>
      <Section icon={<ImagePlus size={18}/>} title="Fotos de trabalhos anteriores" hint={`Mínimo de ${minPhotos} fotos de boa qualidade (recomendamos 4 ou mais): pratos, eventos, ambientes limpos, jardins… ${photos.length} enviada${photos.length === 1 ? '' : 's'}.`}>
        <div className="ob-gallery">
          {photos.map(photo => <div className="ob-photo" key={photo.id}><img src={photo.url} alt="Foto de trabalho"/><button type="button" aria-label="Remover foto" onClick={() => setPhotos(photos.filter(s => s.id !== photo.id))}><X size={15}/></button></div>)}
          {photos.length < 20 && <UploadButton kind="service" accept="image/*" multiple className="ob-photo-add" onUploaded={m => setPhotos(list => [...list, m].slice(0, 20))}><ImagePlus size={22}/><span>Adicionar fotos</span></UploadButton>}
        </div>
        <div className="ob-progress" aria-hidden="true"><span style={{ width: `${Math.min(100, (photos.length / Math.max(4, minPhotos)) * 100)}%` }}/></div>
        {err('photos')}
      </Section>
      <Section icon={<Landmark size={18}/>} title="Conta para receber (banco e Pix)" hint="Os clientes pagam direto para você. Esses dados entram no contrato e não aparecem no site.">
        <div className="ob-grid">
          <Input wide label="Nome do titular" required value={bank.holderName} onChange={v => setBank({ ...bank, holderName: v })} error={errors.holderName}/>
          <Input label="CPF ou CNPJ do titular" required value={bank.holderDocument} onChange={v => setBank({ ...bank, holderDocument: onlyDigits(v).length > 11 ? formatCNPJ(v) : formatCPF(v) })} inputMode="numeric" error={errors.holderDocument}/>
          <label className={`ob-field ${errors.bankName ? 'has-error' : ''}`}><span>Banco<i> *</i></span><input list="ob-banks" value={bank.bankName} onChange={e => setBank({ ...bank, bankName: e.target.value })} placeholder="Ex.: Nubank"/><datalist id="ob-banks">{BANKS.map(b => <option key={b} value={b}/>)}</datalist>{errors.bankName && <small>{errors.bankName}</small>}</label>
          <Input label="Agência" required value={bank.agency} onChange={v => setBank({ ...bank, agency: v.replace(/[^\dXx-]/g, '') })} inputMode="numeric" placeholder="0001" error={errors.agency}/>
          <Input label="Conta com dígito" required value={bank.account} onChange={v => setBank({ ...bank, account: v.replace(/[^\dXx-]/g, '') })} inputMode="numeric" placeholder="12345-6" error={errors.account}/>
          <label className="ob-field"><span>Tipo de conta<i> *</i></span><select value={bank.accountType} onChange={e => setBank({ ...bank, accountType: e.target.value as Bank['accountType'] })}><option value="corrente">Corrente</option><option value="poupanca">Poupança</option><option value="pagamento">Pagamento</option></select></label>
          <label className="ob-field"><span>Tipo de chave Pix<i> *</i></span><select value={bank.pixKeyType} onChange={e => setBank({ ...bank, pixKeyType: e.target.value as PixKeyType, pixKey: '' })}>{PIX_KEY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
          <Input wide label="Chave Pix" required value={bank.pixKey} onChange={v => setBank({ ...bank, pixKey: bank.pixKeyType === 'cpf' ? formatCPF(v) : bank.pixKeyType === 'cnpj' ? formatCNPJ(v) : bank.pixKeyType === 'telefone' ? formatPhone(v) : v })} error={errors.pixKey}/>
        </div>
      </Section>
      <Section icon={<Share2 size={18}/>} title="Redes sociais e site (opcional)">
        <div className="ob-grid">
          <Input label="Instagram" value={socials.instagram} onChange={v => setSocials({ ...socials, instagram: v })} placeholder="@seuperfil"/>
          <Input label="Facebook" value={socials.facebook} onChange={v => setSocials({ ...socials, facebook: v })} placeholder="facebook.com/..."/>
          <Input label="TikTok" value={socials.tiktok} onChange={v => setSocials({ ...socials, tiktok: v })} placeholder="@seuperfil"/>
          <Input label="YouTube" value={socials.youtube} onChange={v => setSocials({ ...socials, youtube: v })} placeholder="@seucanal"/>
          <Input label="LinkedIn" value={socials.linkedin} onChange={v => setSocials({ ...socials, linkedin: v })}/>
          <Input label="Site" value={website} onChange={setWebsite} inputMode="url" placeholder="https://..." error={errors.website}/>
        </div>
      </Section>
    </>}

    <div className="ob-savebar">
      <span>{Object.keys(errors).length ? <><CircleAlert size={16}/> {Object.keys(errors).length} campo(s) para revisar</> : <><Check size={16}/> Seus dados ficam protegidos</>}</span>
      <button type="button" className="ob-btn ob-btn-primary" onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="ob-spin" size={18}/> : <Check size={18}/>} {isClient ? 'Salvar meus dados' : mode === 'required' ? 'Enviar cadastro' : 'Salvar alterações'}</button>
    </div>
  </div>;
}
