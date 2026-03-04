# ⚡ Quick Fix - Erro RLS

## 🔴 Problema
```
Error: new row violates row-level security policy for table "events"
```

## ✅ Solução Rápida (2 minutos)

### 1. Desabilitar RLS no Supabase

No painel do Supabase:
1. Vá em **SQL Editor**
2. Clique em **New Query**
3. Cole este código:

```sql
ALTER TABLE visitors DISABLE ROW LEVEL SECURITY;
ALTER TABLE mchat_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE mchat_answers DISABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist DISABLE ROW LEVEL SECURITY;
ALTER TABLE events DISABLE ROW LEVEL SECURITY;
```

4. Clique em **Run**
5. Deve aparecer: "Success. No rows returned"

### 2. Verificar se Funcionou

Execute esta query:

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('visitors', 'mchat_sessions', 'mchat_answers', 'waitlist', 'events');
```

Todas as tabelas devem ter `rowsecurity = false` ✅

### 3. Reiniciar o Bot

No terminal:
```bash
# Pare o bot (Ctrl+C)
# Inicie novamente
npm run dev
```

Deve aparecer:
```
[AnalyticsService] ✅ Analytics habilitado com Supabase
```

### 4. Testar

1. Envie "Oi" no WhatsApp
2. Envie "triagem"
3. Responda "sim" à primeira pergunta

No terminal, deve aparecer:
```
[MchatService] 📊 Registrando resposta - Sessão: ..., Pergunta: 1, Resposta: sim, Risco: false
[AnalyticsService] ✅ Progresso registrado: Sessão ..., Pergunta 1 (sim, Risco: false)
[MchatService] ✅ Resposta registrada com sucesso
```

✅ **Pronto!** As métricas agora estão funcionando.

---

## 📊 Verificar se TODAS as 20 Respostas Estão Sendo Salvas

Depois de completar um questionário, execute no **SQL Editor**:

```sql
-- Ver última sessão
SELECT
  id,
  status,
  questions_answered,
  risk_score
FROM mchat_sessions
ORDER BY started_at DESC
LIMIT 1;

-- Contar respostas da última sessão
SELECT COUNT(*) as total_respostas
FROM mchat_answers
WHERE session_id = (
  SELECT id FROM mchat_sessions
  ORDER BY started_at DESC
  LIMIT 1
);
```

Deve retornar `total_respostas = 20` ✅

---

## 🔍 Diagnóstico Completo

Para diagnóstico detalhado, execute todo o arquivo:
`supabase/diagnostico.sql`

Isso vai mostrar:
- ✅ Status do RLS
- ✅ Total de registros
- ✅ Últimas sessões
- ✅ Respostas registradas
- ✅ Perguntas faltando (se houver)

---

## 📖 Mais Detalhes

Para mais troubleshooting, veja:
- `TROUBLESHOOTING.md` - Guia completo
- `supabase/README.md` - Setup do Supabase
- `METRICS.md` - Documentação de métricas

---

## 🆘 Ainda Com Erro?

Execute e compartilhe:

**1. Verificar RLS:**
```sql
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
AND tablename = 'events';
```

**2. Logs do bot:**
```bash
npm run dev 2>&1 | grep -i error
```

**3. Testar inserção manual:**
```sql
INSERT INTO events (phone_number, event_type)
VALUES ('test', 'test_event');
```

Se der erro aqui, é problema de RLS ou permissões.
