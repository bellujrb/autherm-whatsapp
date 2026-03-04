# 🔧 Troubleshooting - Sistema de Métricas

## ❌ Erro: "new row violates row-level security policy"

### Causa
O Supabase está com Row Level Security (RLS) habilitado, bloqueando inserções com a chave `anon`.

### Solução

**1. Execute o script SQL para desabilitar RLS:**

No painel do Supabase:
1. Vá em **SQL Editor**
2. Cole o conteúdo de `supabase/migrations/20250304_disable_rls.sql`
3. Clique em **Run**

Ou execute este SQL diretamente:

```sql
-- Desabilitar RLS em todas as tabelas
ALTER TABLE visitors DISABLE ROW LEVEL SECURITY;
ALTER TABLE mchat_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE mchat_answers DISABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist DISABLE ROW LEVEL SECURITY;
ALTER TABLE events DISABLE ROW LEVEL SECURITY;
```

**2. Verifique se RLS foi desabilitado:**

```sql
SELECT
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('visitors', 'mchat_sessions', 'mchat_answers', 'waitlist', 'events');
```

Se `rls_enabled = false` para todas as tabelas, está correto! ✅

**3. Reinicie o bot:**

```bash
# Ctrl+C para parar
npm run dev
```

---

## 🔍 Verificar se Respostas Estão Sendo Registradas

### 1. Execute o Script de Diagnóstico

No **SQL Editor** do Supabase, execute o arquivo completo:
`supabase/diagnostico.sql`

Isso vai mostrar:
- ✅ Status do RLS
- ✅ Quantidade de registros em cada tabela
- ✅ Últimas sessões
- ✅ Respostas da última sessão
- ✅ Se todas as 20 perguntas foram registradas
- ✅ Perguntas faltando (se houver)

### 2. Verificar Logs do Bot

No terminal onde o bot está rodando, procure por:

**✅ Logs de sucesso:**
```
[AnalyticsService] ✅ Progresso registrado: Sessão ..., Pergunta 1 (sim, Risco: false)
[MchatService] ✅ Resposta registrada com sucesso
```

**❌ Logs de erro:**
```
[AnalyticsService] ❌ Erro ao inserir resposta: { code: '42501', ... }
[MchatService] ❌ Erro ao registrar resposta:
```

### 3. Query Rápida para Verificar Última Sessão

```sql
-- Ver última sessão
SELECT * FROM mchat_sessions
ORDER BY started_at DESC
LIMIT 1;

-- Ver respostas da última sessão
SELECT
  ma.question_id,
  ma.user_response,
  ma.is_risk
FROM mchat_answers ma
WHERE ma.session_id = (
  SELECT id FROM mchat_sessions
  ORDER BY started_at DESC
  LIMIT 1
)
ORDER BY ma.question_id;

-- Deve retornar 20 linhas se tudo foi registrado!
```

---

## 📊 Todas as 20 Perguntas Estão Sendo Registradas?

### Query de Verificação

```sql
WITH ultima_sessao AS (
  SELECT id FROM mchat_sessions
  ORDER BY started_at DESC
  LIMIT 1
)
SELECT
  COUNT(*) as total_respostas_registradas,
  CASE
    WHEN COUNT(*) = 20 THEN '✅ Completo!'
    ELSE '❌ Incompleto - Faltam ' || (20 - COUNT(*)) || ' perguntas'
  END as status
FROM mchat_answers
WHERE session_id = (SELECT id FROM ultima_sessao);
```

### Se Estiver Faltando Perguntas

**1. Identifique quais perguntas:**
```sql
WITH ultima_sessao AS (
  SELECT id FROM mchat_sessions
  ORDER BY started_at DESC
  LIMIT 1
),
perguntas_registradas AS (
  SELECT question_id
  FROM mchat_answers
  WHERE session_id = (SELECT id FROM ultima_sessao)
)
SELECT generate_series(1, 20) as pergunta_faltando
EXCEPT
SELECT question_id FROM perguntas_registradas
ORDER BY pergunta_faltando;
```

**2. Verifique os logs do bot** quando responder essas perguntas específicas.

**3. Causas comuns:**
- Timeout na conexão com Supabase
- Erro de validação (resposta inválida)
- Sessão expirou
- Bot reiniciou durante o questionário

---

## ⚠️ Analytics Desabilitado

Se ver esta mensagem nos logs:
```
[AnalyticsService] ⚠️  Supabase não configurado. Analytics desabilitado.
```

### Solução

**1. Verifique variáveis de ambiente:**

```bash
# Verifique se estão definidas
echo $SUPABASE_URL
echo $SUPABASE_ANON_KEY
```

**2. Se estiverem vazias, configure o `.env`:**

```bash
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua_chave_anon_aqui
```

**3. Encontre suas credenciais no Supabase:**
- Vá em **Settings** → **API**
- Copie **Project URL** e **anon/public key**

**4. Reinicie o bot:**
```bash
npm run dev
```

Deve aparecer:
```
[AnalyticsService] ✅ Analytics habilitado com Supabase
```

---

## 🐛 Erros Comuns

### Erro: `Cannot read property 'id' of null`

**Causa:** Tentando registrar resposta sem visitorId ou sessionId.

**Solução:** Certifique-se que o visitante foi rastreado primeiro:
```typescript
// O bot faz isso automaticamente, mas verifique:
const visitorId = await this.analytics.trackVisitor({ phoneNumber: sender });
```

### Erro: `relation "mchat_answers" does not exist`

**Causa:** Tabelas não foram criadas no Supabase.

**Solução:** Execute a migration SQL:
```bash
supabase/migrations/20250304_create_metrics_tables.sql
```

### Erro: `Invalid API key`

**Causa:** SUPABASE_ANON_KEY incorreta ou expirada.

**Solução:**
1. Vá em **Settings** → **API** no Supabase
2. Copie a chave **anon/public** novamente
3. Atualize `.env`
4. Reinicie o bot

---

## 🧪 Teste Manual Completo

### Passo a Passo

**1. Limpe dados antigos (opcional):**
```sql
DELETE FROM mchat_answers;
DELETE FROM mchat_sessions;
DELETE FROM events;
DELETE FROM visitors;
```

**2. Inicie o bot:**
```bash
npm run dev
```

**3. No WhatsApp:**
- Envie "Oi" (deve criar visitante)
- Envie "triagem" (deve criar sessão)
- Responda todas as 20 perguntas com "sim" ou "não"

**4. Verifique no Supabase:**

```sql
-- Deve ter 1 visitante
SELECT COUNT(*) FROM visitors;

-- Deve ter 1 sessão
SELECT COUNT(*) FROM mchat_sessions;

-- Deve ter 20 respostas
SELECT COUNT(*) FROM mchat_answers;

-- Listar todas as respostas
SELECT question_id, user_response, is_risk
FROM mchat_answers
ORDER BY question_id;
```

**5. Verifique logs do bot:**

Deve aparecer 20 vezes:
```
[MchatService] ✅ Resposta registrada com sucesso
[AnalyticsService] ✅ Progresso registrado: Sessão ..., Pergunta X
```

---

## 📞 Ainda Com Problemas?

### Coleta de Informações

Execute e envie estas informações:

**1. Versão do Node:**
```bash
node --version
```

**2. Status do Supabase:**
```sql
SELECT version();
```

**3. Logs completos do bot:**
```bash
npm run dev 2>&1 | tee bot.log
```

**4. Diagnóstico completo:**
Execute `supabase/diagnostico.sql` e copie o resultado.

---

## 🔒 Para Produção

Quando estiver funcionando, **habilite RLS** com políticas apropriadas:

```sql
-- Habilitar RLS
ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE mchat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mchat_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Política: Permitir inserts com anon key
CREATE POLICY "Allow anon inserts" ON visitors
  FOR INSERT
  WITH CHECK (auth.role() = 'anon');

CREATE POLICY "Allow anon inserts" ON mchat_sessions
  FOR INSERT
  WITH CHECK (auth.role() = 'anon');

CREATE POLICY "Allow anon inserts" ON mchat_answers
  FOR INSERT
  WITH CHECK (auth.role() = 'anon');

CREATE POLICY "Allow anon inserts" ON waitlist
  FOR INSERT
  WITH CHECK (auth.role() = 'anon');

CREATE POLICY "Allow anon inserts" ON events
  FOR INSERT
  WITH CHECK (auth.role() = 'anon');

-- Política: Permitir updates com anon key
CREATE POLICY "Allow anon updates" ON mchat_sessions
  FOR UPDATE
  USING (auth.role() = 'anon')
  WITH CHECK (auth.role() = 'anon');
```

**Teste depois de habilitar RLS** para garantir que ainda funciona!
