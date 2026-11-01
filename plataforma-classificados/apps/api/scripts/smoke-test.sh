#!/usr/bin/env bash
set -u
# Teste ponta a ponta contra API + Postgres locais (docker compose up).
# Uso: API=http://localhost:4000 PSQL_URL=postgres://... REDIS_PORT=6379 ./scripts/smoke-test.sh
API=${API:-http://localhost:4000}
PSQL="psql ${PSQL_URL:-postgres://postgres:postgres@localhost:5432/classificados} -tAc"
WEBHOOK_SECRET=${PAYMENT_WEBHOOK_SECRET:-dev-webhook-secret-change-me}
j() { curl -s -H 'Content-Type: application/json' "$@"; }
reg() { j -X POST $API/auth/register -d "{\"email\":\"$1\",\"password\":\"senhaforte123\",\"fullName\":\"Maria da Silva\",\"cpf\":\"$2\",\"rg\":\"123456789\",\"phone\":\"11999998888\",\"cep\":\"04077-000\",\"address\":{\"street\":\"Rua X\",\"number\":\"10\",\"district\":\"Moema\",\"city\":\"São Paulo\",\"state\":\"sp\"},\"birthDate\":\"1995-06-15\",\"displayName\":\"$3\",\"acceptTerms\":true}"; }

echo "== cadastro"
A=$(reg ana@example.com 529.982.247-25 "Ana Luz"); echo "$A" | jq -c '{nextStep}'
TOKEN_A=$(echo "$A" | jq -r .token); UID_A=$(echo "$A" | jq -r .userId)
echo "-- CPF duplicado:"; reg outra@example.com 52998224725 "Xx" | jq -c .
echo "-- menor de idade:"; j -X POST $API/auth/register -d '{"email":"m@e.com","password":"senhaforte123","fullName":"Menor Teste","cpf":"11144477735","rg":"1234","phone":"11999998888","cep":"04077000","address":{"street":"R","number":"1","district":"B","city":"SP","state":"SP"},"birthDate":"2010-01-01","acceptTerms":true}' | jq -c '{error}'
echo "-- PII cifrada no banco (não deve aparecer CPF):"; $PSQL "select position('52998224725' in encode(cpf_enc,'escape')) from advertiser_private_data limit 1"

echo "== anúncio"
AD=$(j -X POST $API/me/ads -H "Authorization: Bearer $TOKEN_A" -d '{"title":"Massagem tântrica relaxante","description":"Atendimento com ducha, maca e óleos aromáticos. Ambiente climatizado.","category":"massagem","gender":"feminino","orientation":"bissexual","massageTypes":["tantrica","relaxante"],"audiences":["homens","casais"],"services":["depilacao","reflexologia_podal"],"serviceLocations":["local_proprio","hotel"],"amenities":["ducha","maca","oleos"],"acceptedPayments":["pix","dinheiro"],"whatsapp":"+5511988887777","offersVideoCall":true,"externalLinks":[{"label":"Privacy","url":"https://privacy.com.br/x"}],"regionLabel":"Moema","city":"São Paulo","state":"SP","lat":-23.601234,"lng":-46.665432,"serviceRadiusKm":10,"prices":[{"label":"1 hora","durationMinutes":60,"priceCents":30000}]}')
echo "$AD" | jq -c .; AD_ID=$(echo "$AD" | jq -r .id)
echo "-- localização arredondada:"; $PSQL "select ST_AsText(location) from advertisements where id='$AD_ID'"
echo "-- submit sem verificação:"; j -X POST $API/me/ads/$AD_ID/submit -H "Authorization: Bearer $TOKEN_A" -d "{}" | jq -c '{error}'

echo "== admin"
ADM=$(reg admin@example.com 65600710577 "Admin"); UID_ADM=$(echo "$ADM" | jq -r .userId)
ADM2=$(reg admin2@example.com 48544755011 "Admin2"); UID_ADM2=$(echo "$ADM2" | jq -r .userId)
$PSQL "update users set role='admin', status='active' where id in ('$UID_ADM','$UID_ADM2')" >/dev/null
TOKEN_ADM=$(j -X POST $API/auth/login -d '{"email":"admin@example.com","password":"senhaforte123"}' | jq -r .token)
echo "-- anunciante tentando rota admin:"; j $API/admin/metrics -H "Authorization: Bearer $TOKEN_A" | jq -c '{error}'
# simula KYC aprovado + foto aprovada (S3 não disponível neste teste)
$PSQL "update profiles set is_verified=true, verified_at=now() where user_id='$UID_A'; update users set status='active' where id='$UID_A';
       insert into ad_media (ad_id,user_id,kind,storage_key,public_url,mime_type,safety_scan_status,moderation) values ('$AD_ID','$UID_A','photo','k','https://cdn.x/f.jpg','image/jpeg','clean','approved')" >/dev/null
echo "-- degustação de 10 dias:"; j -X POST $API/admin/users/$UID_A/trial -H "Authorization: Bearer $TOKEN_ADM" -d '{"reason":"Campanha de lançamento"}' | jq -c .
echo "-- anunciante envia p/ moderação:"; j -X POST $API/me/ads/$AD_ID/submit -H "Authorization: Bearer $TOKEN_A" -d "{}" | jq -c .
echo "-- fila de anúncios:"; j $API/admin/queue/ads -H "Authorization: Bearer $TOKEN_ADM" | jq -c 'map(.title)'
echo "-- aprova:"; j -X POST $API/admin/ads/$AD_ID/status -H "Authorization: Bearer $TOKEN_ADM" -d '{"status":"active","reason":"ok"}' | jq -c .

echo "== busca pública"
echo "-- 5 km de Moema, massagem tântrica:"; curl -s "$API/search?lat=-23.59&lng=-46.66&radiusKm=5&category=massagem&massageTypes=tantrica&services=depilacao&ageMin=25&ageMax=35" | jq -c '.items | map({title,display_name,age,distance_km,price_from_cents,cover_url})'
echo "-- filtro que exclui (penetracao):"; curl -s "$API/search?lat=-23.59&lng=-46.66&radiusKm=5&services=penetracao" | jq -c '.items | length'
echo "-- fora do raio (Campinas, 20 km):"; curl -s "$API/search?lat=-22.90&lng=-47.06&radiusKm=20" | jq -c '.items | length'
echo "-- faixa etária 40-60:"; curl -s "$API/search?ageMin=40&ageMax=60" | jq -c '.items | length'
echo "-- texto livre:"; curl -s "$API/search?q=tantrica" | jq -c '.items | length'
SLUG=$(curl -s "$API/search" | jq -r '.items[0].slug')
echo "-- página pública não expõe PII:"; curl -s "$API/ads/$SLUG" | jq -c '{display_name,age,lat,lng,whatsapp,prices, keys: (keys|length)}'; curl -s "$API/ads/$SLUG" | grep -c -E "529982|Maria da Silva|Rua X" 

echo "== assinatura recorrente (2º anunciante)"
redis-cli -p ${REDIS_PORT:-6379} flushall >/dev/null; B=$(reg bia@example.com 56364214606 "Bia"); TOKEN_B=$(echo "$B" | jq -r .token)
echo "-- quinzenal via PIX Automático:"; j -X POST $API/me/subscription -H "Authorization: Bearer $TOKEN_B" -d '{"planCode":"quinzenal","method":"pix_automatico"}' | jq -c '{error}'
SUB=$(j -X POST $API/me/subscription -H "Authorization: Bearer $TOKEN_B" -d '{"planCode":"mensal","method":"pix_automatico"}'); echo "$SUB" | jq -c '{status,amountCents,pix:.pix.copyPaste}'
SUB_ID=$(echo "$SUB" | jq -r .subscriptionId)
send() { BODY="$1"; SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | awk '{print $2}'); curl -s -X POST $API/webhooks/payments -H 'Content-Type: application/json' -H "x-signature: $SIG" -d "$BODY"; }
EV='{"type":"payment.paid","eventId":"ev1","gatewayPaymentId":"pay1","reference":"sub_'$SUB_ID'","amountCents":14990,"method":"pix_automatico","paidAt":"2026-11-01T12:00:00Z"}'
echo "-- webhook assinatura inválida:"; curl -s -X POST $API/webhooks/payments -H 'Content-Type: application/json' -H "x-signature: bad" -d "$EV" | jq -c .
echo "-- webhook pago:"; send "$EV" | jq -c .
echo "-- reenvio (idempotente):"; send "$EV" | jq -c .
j $API/me/subscription -H "Authorization: Bearer $TOKEN_B" | jq -c '{status,plan,current_period_end}'
echo "-- falha de cobrança → past_due:"; send '{"type":"payment.failed","eventId":"ev2","gatewayPaymentId":"pay2","reference":"sub_'$SUB_ID'","reason":"saldo insuficiente","method":"pix_automatico","amountCents":14990}' | jq -c .
$PSQL "select status, past_due_since is not null from subscriptions where id='$SUB_ID'"

echo "== PPV"
ITEM=$($PSQL "insert into ppv_items (user_id, ad_id, title, kind, media_key, price_cents, view_mode, moderation) values ('$UID_A','$AD_ID','Ensaio exclusivo','photo','ppv/x',1990,'single_view','approved') returning id" | head -1)
curl -s $API/ads/$AD_ID/ppv | jq -c 'map({title,price_cents,view_mode})'
CO=$(j -X POST $API/ppv/checkout -d '{"itemId":"'$ITEM'","email":"cliente@example.com","confirmAdult":true}'); PID=$(echo "$CO" | jq -r .purchaseId); ST=$(echo "$CO" | jq -r .statusToken)
echo "-- status antes do pagamento:"; curl -s $API/ppv/purchases/$PID/status -H "x-status-token: $ST" | jq -c .
send '{"type":"payment.paid","eventId":"ev3","gatewayPaymentId":"pay3","reference":"ppv_'$PID'","amountCents":1990,"method":"pix_avulso","paidAt":"2026-11-01T12:00:00Z"}' | jq -c .
ACC=$(curl -s $API/ppv/purchases/$PID/status -H "x-status-token: $ST" | jq -r .accessToken); echo "-- token recebido: ${ACC:0:12}..."
echo "-- 1ª abertura:"; j -X POST $API/ppv/access/$ACC/open -d "{}" | jq -c '{kind,expiresInSeconds,remainingViews,viewMode}'
echo "-- 2ª abertura (visualização única):"; j -X POST $API/ppv/access/$ACC/open -d "{}" | jq -c '{error,message}'
echo "-- token falsificado:"; j -X POST $API/ppv/access/${ACC%?}A/open -d "{}" | jq -c '{error}'

echo "== painel"
j "$API/admin/metrics?days=7" -H "Authorization: Bearer $TOKEN_ADM" | jq -c '.snapshot | {active_ads,trials,paying_subscriptions,past_due,revenue_today_cents,mrr_cents}'
j "$API/admin/metrics?days=7" -H "Authorization: Bearer $TOKEN_ADM" | jq -c '.series[-1]'
echo "-- SSE (1º evento):"; timeout 2 curl -s -N $API/admin/metrics/stream -H "Authorization: Bearer $TOKEN_ADM" | head -1
echo "-- sinais de fraude:"; j $API/admin/fraud/signals -H "Authorization: Bearer $TOKEN_ADM" | jq -c '{sharedPhone: (.sharedPhone|length), flags: (.flags|length)}'
echo "-- busca por CPF (blind index):"; j "$API/admin/users?q=529.982.247-25" -H "Authorization: Bearer $TOKEN_ADM" | jq -c 'map(.display_name)'
echo "-- denúncia grave pausa anúncio:"; j -X POST $API/ads/$AD_ID/report -d '{"reason":"menor_de_idade"}' | jq -c .; $PSQL "select status from advertisements where id='$AD_ID'"
echo "-- logs:"; j "$API/admin/logs" -H "Authorization: Bearer $TOKEN_ADM" | jq -c 'map(.action)'
echo "-- integridade da cadeia:"; j "$API/admin/logs/verify" -H "Authorization: Bearer $TOKEN_ADM" | jq -c .
echo "-- tentativa de adulterar log:"; $PSQL "update admin_logs set reason='x'" 2>&1 | head -1
echo "== varredura de cobrança"
$PSQL "update subscriptions set trial_ends_at = now() - interval '1 minute' where user_id='$UID_A'; update advertisements set status='active' where id='$AD_ID'" >/dev/null
cd "$(dirname "$0")/.." && npx tsx -e "import('./src/db/pool.js').then(async ({tx,pool})=>{const {billingSweep}=await import('./src/modules/payments/service.js'); console.log(await tx(c=>billingSweep(c))); await pool.end(); process.exit(0)})"
$PSQL "select status from advertisements where id='$AD_ID'"
