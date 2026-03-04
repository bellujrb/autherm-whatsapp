-- ========================================
-- Desabilitar RLS para desenvolvimento
-- ========================================
--
-- IMPORTANTE: Em produção, você deve configurar RLS apropriadamente
-- ao invés de desabilitá-lo completamente.
--
-- Este script desabilita RLS para permitir que o bot insira dados
-- usando a chave anon (SUPABASE_ANON_KEY).

-- Desabilitar RLS em todas as tabelas
ALTER TABLE visitors DISABLE ROW LEVEL SECURITY;
ALTER TABLE mchat_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE mchat_answers DISABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist DISABLE ROW LEVEL SECURITY;
ALTER TABLE events DISABLE ROW LEVEL SECURITY;

-- Mensagem de confirmação
DO $$
BEGIN
  RAISE NOTICE 'RLS desabilitado em todas as tabelas. ATENÇÃO: Configurar políticas apropriadas para produção!';
END $$;

-- ========================================
-- Para produção, use políticas como estas:
-- ========================================
-- (Descomente e ajuste conforme necessário)

/*
-- Habilitar RLS
ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE mchat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mchat_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Política 1: Permitir todas operações com service_role
CREATE POLICY "Service role full access" ON visitors
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON mchat_sessions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON mchat_answers
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON waitlist
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Política 2: Permitir inserções com anon key (para o bot)
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

-- Política 3: Permitir updates com anon key
CREATE POLICY "Allow anon updates" ON visitors
  FOR UPDATE
  USING (auth.role() = 'anon')
  WITH CHECK (auth.role() = 'anon');

CREATE POLICY "Allow anon updates" ON mchat_sessions
  FOR UPDATE
  USING (auth.role() = 'anon')
  WITH CHECK (auth.role() = 'anon');

CREATE POLICY "Allow anon updates" ON waitlist
  FOR UPDATE
  USING (auth.role() = 'anon')
  WITH CHECK (auth.role() = 'anon');
*/
