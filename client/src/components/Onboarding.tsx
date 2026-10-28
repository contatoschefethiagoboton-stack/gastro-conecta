import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Camera, Check, FileText, ImagePlus, Loader2, Upload, X, Building2, UserRound, Landmark, MapPin, Share2, BriefcaseBusiness, CircleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { uploadFile, type MediaKind } from '@/lib/upload';
import { formatCEP, formatCNPJ, formatCPF, formatPhone, isAdult, isValidCEP, isValidCNPJ, isValidCPF, isValidHttpUrl, isValidPhoneBR, isValidPixKey, onlyDigits, PIX_KEY_TYPES, UFS, type PixKeyType } from '@shared/validators';
import '../admin.css';

type Media = { id: number; url: string; name?: string };
type Address = { cep: string; street: string; number: string; complement: string; district: string; city: string; state: string };
type Bank = { holderName: string; holderDocument: string; bankName: string; bankCode: string; agency: string; account: string; accountType: 'corrente' | 'poupanca' | 'pagamento'; pixKeyType: PixKeyType; pixKey: string };
type OnboardingResponse = { accountType: 'client' | 'provider' | 'freelancer'; status: string; email: string; name: string; details: any; completedAt: string | null };

const emptyAddress: Address = { cep: '', street: '', number: '', complement: '', district: '', city: '', state: 'SP' };
const emptyBank: Bank = { holderName: '', holderDocument: '', bankName: '', bankCode: '', agency: '', account: '', accountType: 'corrente', pixKeyType: 'cpf', pixKey: '' };
const ROLES = ['Cozinheiro', 'Ajudante', 'Garçom', 'Barman'] as const;
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

function UploadButton({ kind, accept, multiple, onUploaded, children, className, disabled }: { kind: MediaKind; accept: string; multiple?: boolean; onUploaded: (m: Media) => void; children: ReactNode; className?: string; disabled?: boolean }) {
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
  return <><button type="button" className={className} disabled={busy || disabled} onClick={() => ref.current?.click()}>{busy ? <Loader2 className="ob-spin" size={18}/> : null}{children}</button><input ref={ref} type="file" hidden accept={accept} multiple={multiple} onChange={e => void pick(e.target.files)}/></>;
}

export default function Onboarding({ mode, onDone }: { mode: 'required' | 'edit'; onDone?: () => void }) {
  const [data, setData] = useState<OnboardingResponse | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // comuns
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState<Address>(emptyAddress);
  const [avatar, setAvatar] = useState<Media | null>(null);
  // freelancer
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [experience, setExperience] = useState('');
  const [resume, setResume] = useState<Media | null>(null);
  const [bank, setBank] = useState<Bank>(emptyBank);
  // parceiro
  const [cnpj, setCnpj] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [category, setCategory] = useState<'Chef particular' | 'Buffet'>('Chef particular');
  const [specialty, setSpecialty] = useState('');
  const [bio, setBio] = useState('');
  const [priceFrom, setPriceFrom] = useState('');
  const [services, setServices] = useState<Media[]>([]);
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
      if (d.avatarMediaId) setAvatar({ id: d.avatarMediaId, url: d.avatarUrl });
      if (response.accountType === 'freelancer') {
        setCpf(formatCPF(d.cpf ?? '')); setBirthDate(d.birthDate ?? ''); setRoles(Array.isArray(d.roles) ? d.roles : []); setExperience(d.experience ?? '');
        if (d.resumeMediaId) setResume({ id: d.resumeMediaId, url: d.resumeUrl, name: 'Currículo enviado' });
        if (d.bank) setBank({ ...emptyBank, ...d.bank, holderDocument: d.bank.holderDocument?.length === 14 ? formatCNPJ(d.bank.holderDocument) : formatCPF(d.bank.holderDocument ?? '') });
      } else {
        setCnpj(formatCNPJ(d.cnpj ?? '')); setCompanyName(d.companyName ?? ''); setTradeName(d.tradeName ?? ''); setCategory(d.category === 'Buffet' ? 'Buffet' : 'Chef particular');
        setSpecialty(d.specialty ?? ''); setBio(d.bio ?? ''); setPriceFrom(d.priceFrom ? String(d.priceFrom) : '');
        setServices(Array.isArray(d.serviceUrls) ? d.serviceUrls : []);
        setSocials({ instagram: '', facebook: '', tiktok: '', youtube: '', linkedin: '', ...(d.socials ?? {}) }); setWebsite(d.website ?? '');
      }
    }).catch(error => setLoadError(errorText(error)));
  }, []);

  if (loadError) return <div className="ob-shell"><div className="ob-alert ob-alert-error"><CircleAlert size={18}/> {loadError}</div></div>;
  if (!data) return <div className="ob-shell"><div className="ob-loading"><Loader2 className="ob-spin" size={22}/> Carregando seu cadastro…</div></div>;
  const isFreelancer = data.accountType === 'freelancer';

  const validate = () => {
    const e: Record<string, string> = { ...addressErrors(address) };
    if (fullName.trim().length < 5) e.fullName = 'Informe o nome completo';
    if (!isValidPhoneBR(phone)) e.phone = 'Telefone com DDD inválido';
    if (isFreelancer) {
      if (!isValidCPF(cpf)) e.cpf = 'CPF inválido';
      if (!isAdult(birthDate)) e.birthDate = 'É preciso ter 18 anos ou mais';
      if (!roles.length) e.roles = 'Escolha pelo menos uma função';
      if (experience.trim().length < 20) e.experience = 'Conte sua experiência (mínimo 20 caracteres)';
      if (!resume) e.resume = 'Envie seu currículo';
      if (bank.holderName.trim().length < 3) e.holderName = 'Informe o titular';
      if (!isValidCPF(bank.holderDocument) && !isValidCNPJ(bank.holderDocument)) e.holderDocument = 'CPF/CNPJ do titular inválido';
      if (bank.bankName.trim().length < 2) e.bankName = 'Informe o banco';
      if (!/^\d{3,5}(-?[\dXx])?$/.test(bank.agency.trim())) e.agency = 'Agência inválida';
      if (!/^\d{3,15}(-?[\dXx])?$/.test(bank.account.trim())) e.account = 'Conta inválida';
      if (!isValidPixKey(bank.pixKeyType, bank.pixKey)) e.pixKey = 'Chave Pix inválida para o tipo escolhido';
    } else {
      if (!isValidCNPJ(cnpj)) e.cnpj = 'CNPJ inválido';
      if (companyName.trim().length < 3) e.companyName = 'Informe a razão social';
      if (specialty.trim().length < 2) e.specialty = 'Informe sua especialidade';
      if (bio.trim().length < 30) e.bio = 'Apresente seu trabalho (mínimo 30 caracteres)';
      if (!avatar) e.avatar = 'Envie a foto de perfil';
      if (services.length < 5) e.services = `Envie pelo menos 5 fotos (faltam ${5 - services.length})`;
      if (!Object.values(socials).some(v => v.trim())) e.socials = 'Informe pelo menos uma rede social';
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
      const common = { fullName: fullName.trim(), phone, ...address };
      const payload = isFreelancer
        ? { ...common, cpf, birthDate, roles, experience: experience.trim(), resumeMediaId: resume!.id, avatarMediaId: avatar?.id ?? null, bank: { ...bank, holderName: bank.holderName.trim(), bankName: bank.bankName.trim(), agency: bank.agency.trim(), account: bank.account.trim(), pixKey: bank.pixKey.trim() } }
        : { ...common, cnpj, companyName: companyName.trim(), tradeName: tradeName.trim(), category, specialty: specialty.trim(), bio: bio.trim(), priceFrom: Math.max(0, Math.round(Number(priceFrom.replace(',', '.')) || 0)), avatarMediaId: avatar!.id, serviceMediaIds: services.map(s => s.id), socials, website: website.trim() };
      await api('/onboarding', { method: 'PUT', body: JSON.stringify(payload) });
      toast.success(mode === 'required' ? 'Cadastro enviado! Agora é só aguardar a aprovação.' : 'Cadastro atualizado.');
      onDone?.();
    } catch (error) { toast.error(errorText(error)); }
    finally { setSaving(false); }
  };

  const err = (key: string) => errors[key] ? <small className="ob-error-text">{errors[key]}</small> : null;

  return <div className="ob-shell">
    <div className="ob-intro">
      <span className="ob-kicker">{isFreelancer ? 'Cadastro de freelancer' : 'Cadastro de profissional parceiro'}</span>
      <h2>{mode === 'required' ? 'Complete seu cadastro para começar.' : 'Seus dados de cadastro.'}</h2>
      <p>{isFreelancer ? 'Com o currículo, os dados pessoais e a conta para receber, você pode se candidatar a diárias e receber o pagamento direto do contratante via Pix.' : 'Com fotos, dados da empresa e redes sociais, seu perfil aparece no catálogo e você passa a receber pedidos de orçamento.'}</p>
      {data.status === 'pending' && <div className="ob-alert"><CircleAlert size={17}/> Depois de enviar, a administração confere seus dados e libera a conta. Você recebe acesso às oportunidades assim que for aprovado.</div>}
    </div>

    <Section icon={<Camera size={18}/>} title={isFreelancer ? 'Foto (opcional)' : 'Foto de perfil'} hint={isFreelancer ? 'Ajuda o contratante a reconhecer você.' : 'Logo ou foto sua. Aparece no catálogo.'}>
      <div className="ob-avatar-row">
        <div className="ob-avatar">{avatar ? <img src={avatar.url} alt="Foto de perfil"/> : <UserRound size={34}/>}</div>
        <div className="ob-avatar-actions">
          <UploadButton kind="avatar" accept="image/*" className="ob-btn ob-btn-outline" onUploaded={m => setAvatar(m)}><Upload size={16}/> {avatar ? 'Trocar foto' : 'Enviar foto'}</UploadButton>
          {avatar && isFreelancer && <button type="button" className="ob-link-danger" onClick={() => setAvatar(null)}>Remover</button>}
          {err('avatar')}
        </div>
      </div>
    </Section>

    {isFreelancer ? <>
      <Section icon={<UserRound size={18}/>} title="Dados pessoais">
        <div className="ob-grid">
          <Input wide label="Nome completo" required value={fullName} onChange={setFullName} autoComplete="name" error={errors.fullName}/>
          <Input label="CPF" required value={cpf} onChange={v => setCpf(formatCPF(v))} inputMode="numeric" placeholder="000.000.000-00" error={errors.cpf}/>
          <Input label="Data de nascimento" required type="date" value={birthDate} onChange={setBirthDate} error={errors.birthDate}/>
          <Input label="Celular / WhatsApp" required value={phone} onChange={v => setPhone(formatPhone(v))} inputMode="tel" autoComplete="tel" placeholder="(19) 99999-9999" error={errors.phone}/>
        </div>
      </Section>
      <Section icon={<MapPin size={18}/>} title="Endereço"><AddressFields value={address} onChange={setAddress} errors={errors}/></Section>
      <Section icon={<BriefcaseBusiness size={18}/>} title="Experiência e currículo">
        <div className="ob-chips" role="group" aria-label="Funções">{ROLES.map(role => <button type="button" key={role} className={roles.includes(role) ? 'is-on' : ''} onClick={() => setRoles(roles.includes(role) ? roles.filter(r => r !== role) : [...roles, role])}>{roles.includes(role) && <Check size={14}/>} {role}</button>)}</div>
        {err('roles')}
        <label className={`ob-field ob-wide ${errors.experience ? 'has-error' : ''}`}><span>Resumo da experiência<i> *</i></span><textarea rows={4} maxLength={3000} value={experience} onChange={e => setExperience(e.target.value)} placeholder="Onde já trabalhou, há quanto tempo, tipos de evento, especialidades…"/>{errors.experience && <small>{errors.experience}</small>}</label>
        <div className="ob-file-row">
          <span className="ob-file-icon"><FileText size={20}/></span>
          <div><strong>{resume ? (resume.name || 'Currículo enviado') : 'Currículo'}</strong><span>PDF ou foto, até 4,5 MB</span>{resume && <a href={resume.url} target="_blank" rel="noopener noreferrer">Ver arquivo</a>}</div>
          <UploadButton kind="resume" accept="application/pdf,image/*" className="ob-btn ob-btn-outline" onUploaded={m => setResume(m)}><Upload size={16}/> {resume ? 'Trocar' : 'Enviar currículo'}</UploadButton>
        </div>
        {err('resume')}
      </Section>
      <Section icon={<Landmark size={18}/>} title="Conta para receber (Pix)" hint="Visível só para você, para a administração e para quem contratar você em uma vaga aceita.">
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
    </> : <>
      <Section icon={<Building2 size={18}/>} title="Dados da empresa">
        <div className="ob-grid">
          <Input label="CNPJ" required value={cnpj} onChange={v => setCnpj(formatCNPJ(v))} inputMode="numeric" placeholder="00.000.000/0000-00" error={errors.cnpj}/>
          <Input wide label="Razão social" required value={companyName} onChange={setCompanyName} error={errors.companyName}/>
          <Input wide label="Nome fantasia (aparece no catálogo)" value={tradeName} onChange={setTradeName}/>
          <Input wide label="Nome completo do responsável" required value={fullName} onChange={setFullName} autoComplete="name" error={errors.fullName}/>
          <Input label="Telefone / WhatsApp" required value={phone} onChange={v => setPhone(formatPhone(v))} inputMode="tel" autoComplete="tel" placeholder="(19) 99999-9999" error={errors.phone}/>
        </div>
      </Section>
      <Section icon={<MapPin size={18}/>} title="Endereço da empresa" hint="O endereço completo não aparece no site; só cidade e estado."><AddressFields value={address} onChange={setAddress} errors={errors}/></Section>
      <Section icon={<BriefcaseBusiness size={18}/>} title="Seu serviço">
        <div className="ob-grid">
          <label className="ob-field"><span>Categoria<i> *</i></span><select value={category} onChange={e => setCategory(e.target.value as 'Chef particular' | 'Buffet')}><option>Chef particular</option><option>Buffet</option></select></label>
          <Input wide label="Especialidade" required value={specialty} onChange={setSpecialty} placeholder="Ex.: Cozinha italiana, churrasco, finger food" error={errors.specialty}/>
          <Input label="A partir de (R$ por pessoa, opcional)" value={priceFrom} onChange={v => setPriceFrom(v.replace(/[^\d,.]/g, ''))} inputMode="numeric" placeholder="Ex.: 150"/>
          <label className={`ob-field ob-wide ${errors.bio ? 'has-error' : ''}`}><span>Apresentação<i> *</i></span><textarea rows={4} maxLength={3000} value={bio} onChange={e => setBio(e.target.value)} placeholder="Conte sua história, estilo de cozinha e os eventos que você atende."/>{errors.bio && <small>{errors.bio}</small>}</label>
        </div>
      </Section>
      <Section icon={<ImagePlus size={18}/>} title="Fotos dos seus serviços" hint={`Mínimo de 5 fotos. ${services.length} enviada${services.length === 1 ? '' : 's'}.`}>
        <div className="ob-gallery">
          {services.map(photo => <div className="ob-photo" key={photo.id}><img src={photo.url} alt="Foto de serviço"/><button type="button" aria-label="Remover foto" onClick={() => setServices(services.filter(s => s.id !== photo.id))}><X size={15}/></button></div>)}
          {services.length < 20 && <UploadButton kind="service" accept="image/*" multiple className="ob-photo-add" onUploaded={m => setServices(list => [...list, m].slice(0, 20))}><ImagePlus size={22}/><span>Adicionar fotos</span></UploadButton>}
        </div>
        <div className="ob-progress" aria-hidden="true"><span style={{ width: `${Math.min(100, (services.length / 5) * 100)}%` }}/></div>
        {err('services')}
      </Section>
      <Section icon={<Share2 size={18}/>} title="Redes sociais e site" hint="Informe pelo menos uma rede social (link ou @usuario). O site é opcional.">
        <div className="ob-grid">
          <Input label="Instagram" value={socials.instagram} onChange={v => setSocials({ ...socials, instagram: v })} placeholder="@seuperfil"/>
          <Input label="Facebook" value={socials.facebook} onChange={v => setSocials({ ...socials, facebook: v })} placeholder="facebook.com/..."/>
          <Input label="TikTok" value={socials.tiktok} onChange={v => setSocials({ ...socials, tiktok: v })} placeholder="@seuperfil"/>
          <Input label="YouTube" value={socials.youtube} onChange={v => setSocials({ ...socials, youtube: v })} placeholder="@seucanal"/>
          <Input label="LinkedIn" value={socials.linkedin} onChange={v => setSocials({ ...socials, linkedin: v })}/>
          <Input label="Site (opcional)" value={website} onChange={setWebsite} inputMode="url" placeholder="https://..." error={errors.website}/>
        </div>
        {err('socials')}
      </Section>
    </>}

    <div className="ob-savebar">
      <span>{Object.keys(errors).length ? <><CircleAlert size={16}/> {Object.keys(errors).length} campo(s) para revisar</> : <><Check size={16}/> Seus dados ficam protegidos</>}</span>
      <button type="button" className="ob-btn ob-btn-primary" onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="ob-spin" size={18}/> : <Check size={18}/>} {mode === 'required' ? 'Enviar cadastro' : 'Salvar alterações'}</button>
    </div>
  </div>;
}
