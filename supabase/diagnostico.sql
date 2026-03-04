-- ========================================
-- SCRIPT DE DIAGNÓSTICO
-- Execute este script no Supabase SQL Editor
-- para verificar se os dados estão sendo registrados
-- ========================================

-- 1. Verificar se RLS está desabilitado
SELECT
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('visitors', 'mchat_sessions', 'mchat_answers', 'waitlist', 'events')
ORDER BY tablename;

-- Se rls_enabled = true, execute: supabase/migrations/20250304_disable_rls.sql

-- ========================================

-- 2. Contar registros em cada tabela
SELECT
  'visitors' as tabela,
  COUNT(*) as total_registros
FROM visitors
UNION ALL
SELECT
  'mchat_sessions',
  COUNT(*)
FROM mchat_sessions
UNION ALL
SELECT
  'mchat_answers',
  COUNT(*)
FROM mchat_answers
UNION ALL
SELECT
  'waitlist',
  COUNT(*)
FROM waitlist
UNION ALL
SELECT
  'events',
  COUNT(*)
FROM events;

-- ========================================

-- 3. Últimas sessões criadas
SELECT
  id,
  phone_number,
  status,
  current_question,
  questions_answered,
  started_at,
  last_activity_at
FROM mchat_sessions
ORDER BY started_at DESC
LIMIT 5;

-- ========================================

-- 4. Verificar respostas da última sessão
WITH ultima_sessao AS (
  SELECT id
  FROM mchat_sessions
  ORDER BY started_at DESC
  LIMIT 1
)
SELECT
  ma.question_id,
  SUBSTRING(ma.question_text, 1, 50) || '...' as pergunta,
  ma.user_response,
  ma.is_risk,
  ma.time_to_answer_seconds,
  ma.answered_at
FROM mchat_answers ma
JOIN ultima_sessao us ON ma.session_id = us.id
ORDER BY ma.question_id;

-- ========================================

-- 5. Verificar se TODAS as 20 perguntas estão sendo registradas
WITH ultima_sessao AS (
  SELECT id
  FROM mchat_sessions
  ORDER BY started_at DESC
  LIMIT 1
)
SELECT
  us.id as session_id,
  COUNT(ma.id) as total_respostas,
  CASE
    WHEN COUNT(ma.id) = 20 THEN '✅ Completo (20 respostas)'
    WHEN COUNT(ma.id) > 0 THEN '⚠️  Incompleto (' || COUNT(ma.id) || ' respostas)'
    ELSE '❌ Nenhuma resposta registrada'
  END as status,
  ARRAY_AGG(ma.question_id ORDER BY ma.question_id) as perguntas_respondidas
FROM ultima_sessao us
LEFT JOIN mchat_answers ma ON ma.session_id = us.id
GROUP BY us.id;

-- ========================================

-- 6. Verificar perguntas faltando (se houver)
WITH ultima_sessao AS (
  SELECT id
  FROM mchat_sessions
  ORDER BY started_at DESC
  LIMIT 1
),
perguntas_esperadas AS (
  SELECT generate_series(1, 20) as question_id
),
perguntas_registradas AS (
  SELECT ma.question_id
  FROM mchat_answers ma
  JOIN ultima_sessao us ON ma.session_id = us.id
)
SELECT
  pe.question_id as pergunta_faltando
FROM perguntas_esperadas pe
LEFT JOIN perguntas_registradas pr ON pe.question_id = pr.question_id
WHERE pr.question_id IS NULL
ORDER BY pe.question_id;

-- ========================================

-- 7. Estatísticas de respostas por pergunta
SELECT
  question_id,
  COUNT(*) as total_respostas,
  SUM(CASE WHEN user_response = 'sim' THEN 1 ELSE 0 END) as total_sim,
  SUM(CASE WHEN user_response = 'nao' THEN 1 ELSE 0 END) as total_nao,
  SUM(CASE WHEN is_risk THEN 1 ELSE 0 END) as total_risco,
  ROUND(AVG(time_to_answer_seconds), 2) as tempo_medio_segundos
FROM mchat_answers
GROUP BY question_id
ORDER BY question_id;

-- ========================================

-- 8. Verificar eventos registrados
SELECT
  event_type,
  COUNT(*) as total
FROM events
GROUP BY event_type
ORDER BY total DESC;

-- ========================================

-- 9. Últimos erros (se houver tabela de logs)
-- Nota: Supabase não tem tabela de erros por padrão
-- Verifique logs no Dashboard do Supabase em "Logs" -> "Database"

-- ========================================

-- 10. Sessões completadas vs incompletas
SELECT
  status,
  COUNT(*) as total,
  ROUND(COUNT(*)::NUMERIC / SUM(COUNT(*)) OVER () * 100, 2) as percentual
FROM mchat_sessions
GROUP BY status
ORDER BY total DESC;

-- ========================================
-- DICAS DE TROUBLESHOOTING
-- ========================================

/*
Se não houver dados:
1. Verifique se o bot está rodando
2. Envie uma mensagem de teste no WhatsApp
3. Verifique logs do bot no terminal
4. Certifique-se que SUPABASE_URL e SUPABASE_ANON_KEY estão corretos no .env

Se houver sessões mas sem respostas:
1. Verifique se RLS está desabilitado (query 1)
2. Execute: supabase/migrations/20250304_disable_rls.sql
3. Verifique logs do bot para erros de Supabase

Se algumas perguntas não estão sendo registradas:
1. Verifique a query 6 para ver quais perguntas faltam
2. Verifique logs do bot quando responder essas perguntas
3. Pode ser erro de timeout ou validação

Para limpar dados de teste:
DELETE FROM mchat_answers;
DELETE FROM mchat_sessions;
DELETE FROM waitlist;
DELETE FROM events;
DELETE FROM visitors;
*/
