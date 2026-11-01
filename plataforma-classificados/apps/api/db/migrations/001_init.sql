-- =============================================================================
-- 001_init.sql — Esquema base da plataforma de classificados adultos
-- PostgreSQL 16 + PostGIS 3
--
-- Princípios:
--   * Dados pessoais (PII) ficam em tabela separada, CIFRADOS na aplicação
--     (AES-256-GCM). O banco nunca vê CPF/RG/endereço em texto claro.
--   * "Blind index" (HMAC) permite checar unicidade/duplicidade de CPF e
--     telefone sem decifrar nada.
--   * Localização pública é APROXIMADA (arredondada) — nunca o endereço real.
--   * Logs administrativos são somente-inserção e encadeados por hash.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Busca textual em português que ignora acentos ("tantrica" encontra "tântrica")
CREATE TEXT SEARCH CONFIGURATION pt_unaccent (COPY = portuguese);
ALTER TEXT SEARCH CONFIGURATION pt_unaccent
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, portuguese_stem;

-- -----------------------------------------------------------------------------
-- Tipos enumerados (taxonomia). Mantidos em sincronia com src/modules/taxonomy.ts
-- -----------------------------------------------------------------------------
CREATE TYPE user_role           AS ENUM ('advertiser', 'moderator', 'admin');
CREATE TYPE account_status      AS ENUM ('pending_verification', 'active', 'suspended', 'banned', 'deleted');
CREATE TYPE verification_status AS ENUM ('awaiting_upload', 'processing', 'pending_review', 'approved', 'rejected');
CREATE TYPE document_type       AS ENUM ('rg', 'cnh', 'passport');

CREATE TYPE ad_category      AS ENUM ('acompanhante', 'massagem');
CREATE TYPE ad_gender        AS ENUM ('feminino', 'masculino', 'trans');
CREATE TYPE massage_type     AS ENUM ('terapeutica', 'sensorial', 'tantrica', 'tailandesa', 'relaxante', 'corpo_a_corpo', 'prostatica');
CREATE TYPE orientation      AS ENUM ('hetero', 'bissexual', 'gay', 'trans');
CREATE TYPE audience         AS ENUM ('homens', 'mulheres', 'casais', 'pcd');
CREATE TYPE service_practice AS ENUM ('final_feliz', 'masturbacao', 'sexo_oral', 'penetracao', 'depilacao', 'estetica', 'reflexologia_podal');
CREATE TYPE service_location AS ENUM ('domicilio', 'hotel', 'motel', 'local_proprio');
CREATE TYPE amenity          AS ENUM ('ducha', 'maca', 'tatame', 'futon', 'oleos', 'velas', 'musica', 'descartaveis');
CREATE TYPE accepted_payment AS ENUM ('dinheiro', 'pix', 'cartao', 'paypal');

CREATE TYPE ad_status AS ENUM (
  'draft',            -- rascunho
  'pending_review',   -- aguardando moderação
  'active',           -- publicado
  'paused_by_user',   -- pausado pelo anunciante
  'paused_by_admin',  -- pausado pela moderação
  'paused_billing',   -- pausado por falta de pagamento
  'rejected',
  'removed'           -- exclusão lógica
);
CREATE TYPE media_kind        AS ENUM ('photo', 'video', 'verification_video');
CREATE TYPE moderation_status AS ENUM ('pending', 'approved', 'rejected', 'blocked');

CREATE TYPE billing_interval    AS ENUM ('quinzenal', 'mensal');
CREATE TYPE subscription_status AS ENUM ('incomplete', 'trialing', 'active', 'past_due', 'canceled', 'expired');
CREATE TYPE payment_method      AS ENUM ('pix_automatico', 'cartao_credito', 'debito_conta', 'pix_avulso');
CREATE TYPE payment_status      AS ENUM ('pending', 'paid', 'failed', 'refunded', 'chargeback', 'canceled');

CREATE TYPE ppv_view_mode         AS ENUM ('single_view', 'time_limited');
CREATE TYPE legal_request_status  AS ENUM ('received', 'approved', 'rejected', 'fulfilled');
CREATE TYPE legal_request_scope   AS ENUM ('dados_cadastrais', 'completo');

-- Gatilho genérico de updated_at
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- =============================================================================
-- USUÁRIOS
-- =============================================================================

-- Conta de acesso (anunciantes e equipe). Clientes finais NÃO têm conta.
CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             citext NOT NULL UNIQUE,
  password_hash     text   NOT NULL,                 -- argon2id
  role              user_role      NOT NULL DEFAULT 'advertiser',
  status            account_status NOT NULL DEFAULT 'pending_verification',
  mfa_secret_enc    bytea,                           -- TOTP (obrigatório p/ admin)
  terms_accepted_at timestamptz NOT NULL,
  terms_version     text NOT NULL,
  last_login_at     timestamptz,
  last_login_ip     inet,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Dados SIGILOSOS do anunciante (uso interno / respaldo jurídico).
-- Todos os *_enc são AES-256-GCM com AAD = user_id (impede troca de linhas).
-- Nenhum endpoint público faz SELECT nesta tabela.
CREATE TABLE advertiser_private_data (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  full_name_enc bytea NOT NULL,
  cpf_enc       bytea NOT NULL,
  cpf_hash      bytea NOT NULL UNIQUE,   -- HMAC-SHA256: 1 cadastro por CPF
  rg_enc        bytea NOT NULL,
  phone_enc     bytea NOT NULL,          -- telefone PESSOAL (não é o do anúncio)
  phone_hash    bytea NOT NULL,          -- detecção de contas duplicadas
  cep_enc       bytea NOT NULL,
  address_enc   bytea NOT NULL,          -- JSON cifrado: logradouro, número, bairro, cidade, UF
  key_version   smallint NOT NULL DEFAULT 1,  -- rotação de chave
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_private_phone_hash ON advertiser_private_data (phone_hash);
CREATE TRIGGER trg_private_updated BEFORE UPDATE ON advertiser_private_data FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Perfil PÚBLICO (nome artístico).
CREATE TABLE profiles (
  user_id                     uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name                text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 60),
  slug                        text NOT NULL UNIQUE,
  birth_date                  date NOT NULL,      -- interno; público vê só a idade. Substituído pela data do documento após KYC.
  is_verified                 boolean NOT NULL DEFAULT false,
  verified_at                 timestamptz,
  verification_video_media_id uuid,               -- FK adicionada abaixo
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Verificação de identidade (+18): documento + selfie + vídeo com código-desafio.
CREATE TABLE identity_verifications (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users(id),
  status               verification_status NOT NULL DEFAULT 'awaiting_upload',
  document_type        document_type,
  challenge_code       text NOT NULL,      -- deve ser mostrado/falado no vídeo (anti-reuso)
  document_front_key   text,               -- chaves no bucket PRIVADO
  document_back_key    text,
  selfie_key           text,
  video_key            text,
  provider             text,
  provider_reference   text,
  face_match_score     numeric(5,4),
  liveness_score       numeric(5,4),
  document_authentic   boolean,
  document_birth_date  date,
  document_cpf_matches boolean,
  challenge_detected   boolean,
  auto_decision        text,               -- recommend_approve | recommend_reject | hard_reject
  auto_reasons         text[] NOT NULL DEFAULT '{}',
  reviewed_by          uuid REFERENCES users(id),
  reviewed_at          timestamptz,
  rejection_reason     text,
  submitted_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_kyc_queue ON identity_verifications (status, submitted_at);
CREATE UNIQUE INDEX uq_kyc_one_open ON identity_verifications (user_id)
  WHERE status IN ('awaiting_upload', 'processing', 'pending_review');
CREATE TRIGGER trg_kyc_updated BEFORE UPDATE ON identity_verifications FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Eventos de autenticação (Marco Civil art. 15: guarda de registros de acesso por 6 meses)
CREATE TABLE auth_events (
  id         bigserial PRIMARY KEY,
  user_id    uuid REFERENCES users(id),
  email_hash bytea NOT NULL,
  success    boolean NOT NULL,
  ip         inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_auth_events_ip ON auth_events (ip, created_at);
CREATE INDEX idx_auth_events_user ON auth_events (user_id, created_at);

-- =============================================================================
-- ANÚNCIOS
-- =============================================================================
CREATE TABLE advertisements (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id),
  slug               text NOT NULL UNIQUE,
  title              text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 120),
  description        text NOT NULL CHECK (char_length(description) <= 5000),

  -- Filtros
  category           ad_category NOT NULL,
  gender             ad_gender   NOT NULL,
  orientation        orientation NOT NULL,
  massage_types      massage_type[]     NOT NULL DEFAULT '{}',
  audiences          audience[]         NOT NULL DEFAULT '{}',
  services           service_practice[] NOT NULL DEFAULT '{}',
  service_locations  service_location[] NOT NULL DEFAULT '{}',
  amenities          amenity[]          NOT NULL DEFAULT '{}',
  accepted_payments  accepted_payment[] NOT NULL DEFAULT '{}',

  -- Contatos públicos (do anúncio — distintos do telefone pessoal sigiloso)
  whatsapp           text,
  telegram           text,
  phone_public       text,
  offers_video_call  boolean NOT NULL DEFAULT false,
  external_links     jsonb   NOT NULL DEFAULT '[]',   -- [{ "label": "Privacy", "url": "https://..." }]

  -- Localização pública APROXIMADA (centro da região arredondado ~1 km)
  region_label       text NOT NULL,          -- ex.: "Moema / Zona Sul"
  city               text NOT NULL,
  state              char(2),
  country            char(2) NOT NULL DEFAULT 'BR',
  location           geography(Point, 4326) NOT NULL,
  service_radius_km  smallint NOT NULL DEFAULT 5 CHECK (service_radius_km BETWEEN 0 AND 200),

  status             ad_status NOT NULL DEFAULT 'draft',
  moderation_note    text,
  published_at       timestamptz,
  visible_until      timestamptz,            -- = fim do período pago/degustação

  search_vector tsvector GENERATED ALWAYS AS (
      setweight(to_tsvector('pt_unaccent'::regconfig, coalesce(title, '')), 'A')
   || setweight(to_tsvector('pt_unaccent'::regconfig, coalesce(region_label, '') || ' ' || coalesce(city, '')), 'B')
   || setweight(to_tsvector('pt_unaccent'::regconfig, coalesce(description, '')), 'C')
  ) STORED,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_massage_types_only_for_massage CHECK (category = 'massagem' OR cardinality(massage_types) = 0),
  CONSTRAINT ck_external_links_array CHECK (jsonb_typeof(external_links) = 'array')
);

-- Índices de busca: geográfico parcial (só anúncios publicados) + GIN nos filtros
CREATE INDEX idx_ads_geo_active   ON advertisements USING gist (location) WHERE status = 'active';
CREATE INDEX idx_ads_cat_gender   ON advertisements (category, gender, status);
CREATE INDEX idx_ads_published    ON advertisements (published_at DESC, id DESC) WHERE status = 'active';
CREATE INDEX idx_ads_user         ON advertisements (user_id);
CREATE INDEX idx_ads_massage      ON advertisements USING gin (massage_types);
CREATE INDEX idx_ads_audiences    ON advertisements USING gin (audiences);
CREATE INDEX idx_ads_services     ON advertisements USING gin (services);
CREATE INDEX idx_ads_locations    ON advertisements USING gin (service_locations);
CREATE INDEX idx_ads_amenities    ON advertisements USING gin (amenities);
CREATE INDEX idx_ads_payments     ON advertisements USING gin (accepted_payments);
CREATE INDEX idx_ads_fts          ON advertisements USING gin (search_vector);
CREATE TRIGGER trg_ads_updated BEFORE UPDATE ON advertisements FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tabela de preços do anúncio (30 min, 1 h, pernoite...)
CREATE TABLE ad_prices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id            uuid NOT NULL REFERENCES advertisements(id) ON DELETE CASCADE,
  label            text NOT NULL,
  duration_minutes integer CHECK (duration_minutes > 0),
  price_cents      integer NOT NULL CHECK (price_cents >= 0),
  currency         char(3) NOT NULL DEFAULT 'BRL',
  position         smallint NOT NULL DEFAULT 0
);
CREATE INDEX idx_ad_prices_ad ON ad_prices (ad_id, price_cents);

-- Fotos e vídeos do anúncio (upload vai p/ bucket privado; após aprovação é copiado p/ o público/CDN)
CREATE TABLE ad_media (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id              uuid REFERENCES advertisements(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES users(id),
  kind               media_kind NOT NULL,
  storage_key        text NOT NULL,            -- bucket privado (quarentena)
  public_key         text,                     -- bucket público após aprovação
  public_url         text,
  mime_type          text NOT NULL,
  size_bytes         bigint,
  width              integer,
  height             integer,
  duration_seconds   numeric(8,2),
  sha256             bytea,                    -- duplicidade exata entre contas
  phash              bigint,                   -- dHash 64 bits: fotos "roubadas"/recortadas
  safety_scan_status text NOT NULL DEFAULT 'pending'
                     CHECK (safety_scan_status IN ('pending', 'clean', 'flagged', 'error')),
  moderation         moderation_status NOT NULL DEFAULT 'pending',
  moderated_by       uuid REFERENCES users(id),
  moderated_at       timestamptz,
  rejection_reason   text,
  position           smallint NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_media_ad      ON ad_media (ad_id, position) WHERE moderation = 'approved';
CREATE INDEX idx_media_queue   ON ad_media (moderation, created_at) WHERE moderation = 'pending';
CREATE INDEX idx_media_sha256  ON ad_media (sha256);
CREATE INDEX idx_media_phash   ON ad_media (phash);

ALTER TABLE profiles ADD CONSTRAINT fk_profiles_verification_video
  FOREIGN KEY (verification_video_media_id) REFERENCES ad_media(id) ON DELETE SET NULL;

-- Denúncias públicas (qualquer visitante, sem login)
CREATE TABLE reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id         uuid NOT NULL REFERENCES advertisements(id) ON DELETE CASCADE,
  reason        text NOT NULL CHECK (reason IN ('menor_de_idade', 'perfil_falso', 'golpe', 'trafico_coercao', 'conteudo_sem_consentimento', 'outro')),
  details       text,
  reporter_ip   inet,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'dismissed')),
  resolved_by   uuid REFERENCES users(id),
  resolved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reports_open ON reports (status, created_at);

-- Sinais de fraude/risco gerados automaticamente ou pela moderação
CREATE TABLE fraud_flags (
  id          bigserial PRIMARY KEY,
  user_id     uuid REFERENCES users(id),
  kind        text NOT NULL,      -- menor_de_idade, csam_match, cpf_divergente, chargeback, midia_duplicada...
  severity    text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  details     jsonb NOT NULL DEFAULT '{}',
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'false_positive')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fraud_open ON fraud_flags (status, severity, created_at);

-- =============================================================================
-- ASSINATURAS E PAGAMENTOS
-- =============================================================================
CREATE TABLE plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  cycle       billing_interval NOT NULL,
  period_days smallint NOT NULL CHECK (period_days > 0),
  price_cents integer  NOT NULL CHECK (price_cents > 0),
  currency    char(3)  NOT NULL DEFAULT 'BRL',
  max_ads     smallint NOT NULL DEFAULT 1,
  max_photos  smallint NOT NULL DEFAULT 20,
  features    jsonb    NOT NULL DEFAULT '{}',
  is_active   boolean  NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO plans (code, name, cycle, period_days, price_cents, features) VALUES
  ('quinzenal', 'Plano Quinzenal', 'quinzenal', 15,  8990, '{"destaque": false}'),
  ('mensal',    'Plano Mensal',    'mensal',    30, 14990, '{"destaque": true}');

CREATE TABLE discounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             citext UNIQUE,              -- NULL = desconto manual (sem cupom)
  description      text NOT NULL,
  percent_off      smallint CHECK (percent_off BETWEEN 1 AND 100),
  amount_off_cents integer  CHECK (amount_off_cents > 0),
  duration_cycles  smallint CHECK (duration_cycles > 0),   -- NULL = para sempre
  valid_until      timestamptz,
  max_redemptions  integer,
  redemptions      integer NOT NULL DEFAULT 0,
  created_by       uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_discount_one_kind CHECK ((percent_off IS NULL) <> (amount_off_cents IS NULL))
);

CREATE TABLE subscriptions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid NOT NULL REFERENCES users(id),
  plan_id                   uuid NOT NULL REFERENCES plans(id),
  status                    subscription_status NOT NULL DEFAULT 'incomplete',
  payment_method            payment_method,          -- NULL em degustação manual
  gateway                   text,
  gateway_customer_id       text,
  gateway_subscription_id   text,                    -- id da recorrência / autorização PIX Automático / assinatura do cartão
  current_period_start      timestamptz,
  current_period_end        timestamptz,
  trial_ends_at             timestamptz,
  trial_granted_by          uuid REFERENCES users(id),
  discount_id               uuid REFERENCES discounts(id),
  discount_cycles_remaining smallint,
  cancel_at_period_end      boolean NOT NULL DEFAULT false,
  canceled_at               timestamptz,
  past_due_since            timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway, gateway_subscription_id)
);
-- No máximo uma assinatura "viva" por anunciante
CREATE UNIQUE INDEX uq_subscription_live ON subscriptions (user_id)
  WHERE status IN ('incomplete', 'trialing', 'active', 'past_due');
CREATE INDEX idx_subscriptions_sweep ON subscriptions (status, current_period_end);
CREATE TRIGGER trg_subs_updated BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- PAY-PER-VIEW
-- =============================================================================
CREATE TABLE ppv_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id),
  ad_id               uuid REFERENCES advertisements(id) ON DELETE SET NULL,
  title               text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 100),
  description         text,
  kind                text NOT NULL CHECK (kind IN ('photo', 'video')),
  media_key           text NOT NULL,          -- SEMPRE bucket privado; nunca há URL pública
  teaser_key          text,                   -- prévia borrada (bucket público)
  teaser_url          text,
  price_cents         integer NOT NULL CHECK (price_cents >= 500),
  view_mode           ppv_view_mode NOT NULL DEFAULT 'single_view',
  max_views           smallint NOT NULL DEFAULT 1  CHECK (max_views BETWEEN 1 AND 10),
  view_window_seconds integer  NOT NULL DEFAULT 60 CHECK (view_window_seconds BETWEEN 10 AND 86400),
  access_valid_days   smallint NOT NULL DEFAULT 7  CHECK (access_valid_days BETWEEN 1 AND 90),
  sha256              bytea,
  moderation          moderation_status NOT NULL DEFAULT 'pending',
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_single_view CHECK (view_mode <> 'single_view' OR max_views = 1)
);
CREATE INDEX idx_ppv_items_ad ON ppv_items (ad_id) WHERE moderation = 'approved' AND is_active;
CREATE TRIGGER trg_ppv_items_updated BEFORE UPDATE ON ppv_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Compra rápida sem cadastro: identificamos o comprador por e-mail (cifrado).
-- O token de acesso é derivado por HMAC (não fica armazenado).
CREATE TABLE ppv_purchases (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id              uuid NOT NULL REFERENCES ppv_items(id),
  buyer_email_enc      bytea NOT NULL,
  buyer_email_hash     bytea NOT NULL,
  amount_cents         integer NOT NULL,
  platform_fee_cents   integer NOT NULL,
  creator_amount_cents integer NOT NULL,
  status               payment_status NOT NULL DEFAULT 'pending',
  status_secret_hash   bytea NOT NULL,        -- p/ o navegador consultar o status sem login
  watermark_code       text NOT NULL,         -- código forense sobreposto à mídia
  views_used           smallint NOT NULL DEFAULT 0,
  access_expires_at    timestamptz,
  first_opened_at      timestamptz,
  consumed_at          timestamptz,           -- visualizações esgotadas
  revoked_at           timestamptz,           -- estorno/chargeback/fraude
  buyer_ip             inet,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ppv_purchases_item  ON ppv_purchases (item_id, status);
CREATE INDEX idx_ppv_purchases_buyer ON ppv_purchases (buyer_email_hash);
CREATE TRIGGER trg_ppv_purchases_updated BEFORE UPDATE ON ppv_purchases FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE ppv_access_logs (
  id          bigserial PRIMARY KEY,
  purchase_id uuid NOT NULL REFERENCES ppv_purchases(id),
  ip          inet,
  user_agent  text,
  opened_at   timestamptz NOT NULL DEFAULT now()
);

-- Pagamentos (assinatura e PPV)
CREATE TABLE payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid REFERENCES users(id),
  subscription_id    uuid REFERENCES subscriptions(id),
  ppv_purchase_id    uuid REFERENCES ppv_purchases(id),
  purpose            text NOT NULL CHECK (purpose IN ('subscription', 'ppv')),
  method             payment_method NOT NULL,
  gateway            text NOT NULL,
  gateway_payment_id text NOT NULL,
  amount_cents       integer NOT NULL,
  currency           char(3) NOT NULL DEFAULT 'BRL',
  status             payment_status NOT NULL DEFAULT 'pending',
  paid_at            timestamptz,
  failure_reason     text,
  raw                jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway, gateway_payment_id)
);
CREATE INDEX idx_payments_paid ON payments (paid_at) WHERE status = 'paid';
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Idempotência de webhooks
CREATE TABLE webhook_events (
  id           bigserial PRIMARY KEY,
  gateway      text NOT NULL,
  event_id     text NOT NULL,
  event_type   text NOT NULL,
  payload      jsonb NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error        text,
  UNIQUE (gateway, event_id)
);

-- =============================================================================
-- AUDITORIA E COMPLIANCE
-- =============================================================================

-- Log administrativo: somente inserção + cadeia de hash (evidência de adulteração)
CREATE TABLE admin_logs (
  id           bigint PRIMARY KEY,
  admin_id     uuid NOT NULL REFERENCES users(id),
  action       text NOT NULL,          -- ex.: ad.status, media.approve, trial.grant, legal.export
  target_type  text NOT NULL,
  target_id    text NOT NULL,
  before_state jsonb,
  after_state  jsonb,
  reason       text,
  ip           inet,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  prev_hash    bytea,
  row_hash     bytea NOT NULL
);
CREATE SEQUENCE admin_logs_id_seq OWNED BY admin_logs.id;
CREATE INDEX idx_admin_logs_target ON admin_logs (target_type, target_id);
CREATE INDEX idx_admin_logs_admin  ON admin_logs (admin_id, created_at);

CREATE FUNCTION admin_logs_row_hash(r admin_logs, prev bytea) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$
  SELECT digest(
    coalesce(encode(prev, 'hex'), '') || '|' || r.id::text || '|' || r.admin_id::text || '|' ||
    r.action || '|' || r.target_type || '|' || r.target_id || '|' ||
    coalesce(r.before_state::text, '') || '|' || coalesce(r.after_state::text, '') || '|' ||
    coalesce(r.reason, '') || '|' || extract(epoch FROM r.created_at)::text,
    'sha256')
$$;

CREATE FUNCTION admin_logs_chain() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE last_hash bytea;
BEGIN
  -- serializa inserções: o id é atribuído DEPOIS do lock, garantindo ordem = cadeia
  PERFORM pg_advisory_xact_lock(hashtext('admin_logs_chain'));
  NEW.id := nextval('admin_logs_id_seq');
  NEW.created_at := now();
  SELECT row_hash INTO last_hash FROM admin_logs ORDER BY id DESC LIMIT 1;
  NEW.prev_hash := last_hash;
  NEW.row_hash := admin_logs_row_hash(NEW, last_hash);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_admin_logs_chain BEFORE INSERT ON admin_logs FOR EACH ROW EXECUTE FUNCTION admin_logs_chain();

CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Tabela % é somente-inserção', TG_TABLE_NAME; END $$;
CREATE TRIGGER trg_admin_logs_immutable BEFORE UPDATE OR DELETE ON admin_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Verifica a cadeia; retorna o primeiro id adulterado (NULL = íntegra)
CREATE FUNCTION admin_logs_verify() RETURNS bigint LANGUAGE plpgsql STABLE AS $$
DECLARE r admin_logs; prev bytea := NULL;
BEGIN
  FOR r IN SELECT * FROM admin_logs ORDER BY id LOOP
    IF r.prev_hash IS DISTINCT FROM prev OR r.row_hash <> admin_logs_row_hash(r, prev) THEN
      RETURN r.id;
    END IF;
    prev := r.row_hash;
  END LOOP;
  RETURN NULL;
END $$;

-- Requisições de autoridades (ordem judicial / requisição de dados cadastrais)
CREATE TABLE legal_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id  uuid NOT NULL REFERENCES users(id),
  authority       text NOT NULL,          -- ex.: "1ª Vara Criminal de SP", "DEIC/SP"
  process_number  text NOT NULL,
  scope           legal_request_scope NOT NULL,
  document_key    text NOT NULL,          -- ofício/ordem digitalizada (bucket privado)
  notes           text,
  status          legal_request_status NOT NULL DEFAULT 'received',
  created_by      uuid NOT NULL REFERENCES users(id),
  approved_by     uuid REFERENCES users(id),     -- 2º administrador (princípio dos quatro olhos)
  approved_at     timestamptz,
  fulfilled_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_four_eyes CHECK (approved_by IS NULL OR approved_by <> created_by)
);

-- Todo acesso (decifragem) a dado sigiloso ou documento de KYC é registrado
CREATE TABLE private_data_access_logs (
  id               bigserial PRIMARY KEY,
  accessed_by      uuid NOT NULL REFERENCES users(id),
  target_user_id   uuid NOT NULL REFERENCES users(id),
  legal_request_id uuid REFERENCES legal_requests(id),
  fields           text[] NOT NULL,
  purpose          text NOT NULL,
  ip               inet,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_pdal_immutable BEFORE UPDATE OR DELETE ON private_data_access_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
