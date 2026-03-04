-- ========================================
-- Tabela de Visitantes (Visitor Tracking)
-- ========================================
CREATE TABLE IF NOT EXISTS visitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL UNIQUE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_interactions INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_visitors_phone ON visitors(phone_number);
CREATE INDEX idx_visitors_first_seen ON visitors(first_seen_at);

-- ========================================
-- Tabela de Sessões M-CHAT
-- ========================================
CREATE TABLE IF NOT EXISTS mchat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id UUID NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,

  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Status da sessão
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'in_progress', 'completed', 'abandoned')),

  -- Métricas de progresso
  current_question INTEGER NOT NULL DEFAULT 0,
  total_questions INTEGER NOT NULL DEFAULT 20,
  questions_answered INTEGER NOT NULL DEFAULT 0,

  -- Resultado
  risk_score INTEGER,
  risk_level TEXT CHECK (risk_level IN ('baixo', 'moderado', 'alto')),
  risk_items TEXT,

  -- Feedback pós-triagem
  clarity_response BOOLEAN, -- Se o usuário entendeu o resultado

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mchat_sessions_visitor ON mchat_sessions(visitor_id);
CREATE INDEX idx_mchat_sessions_phone ON mchat_sessions(phone_number);
CREATE INDEX idx_mchat_sessions_status ON mchat_sessions(status);
CREATE INDEX idx_mchat_sessions_started_at ON mchat_sessions(started_at);
CREATE INDEX idx_mchat_sessions_finished_at ON mchat_sessions(finished_at);

-- ========================================
-- Tabela de Respostas M-CHAT
-- ========================================
CREATE TABLE IF NOT EXISTS mchat_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES mchat_sessions(id) ON DELETE CASCADE,

  -- Dados da pergunta
  question_id INTEGER NOT NULL,
  question_text TEXT NOT NULL,

  -- Resposta do usuário
  user_response TEXT NOT NULL CHECK (user_response IN ('sim', 'nao')),
  is_risk BOOLEAN NOT NULL,

  -- Timing
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  time_to_answer_seconds INTEGER, -- Tempo desde a última pergunta

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mchat_answers_session ON mchat_answers(session_id);
CREATE INDEX idx_mchat_answers_question ON mchat_answers(question_id);
CREATE INDEX idx_mchat_answers_risk ON mchat_answers(is_risk);

-- ========================================
-- Tabela de Lista de Espera (Waitlist)
-- ========================================
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id UUID NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  session_id UUID REFERENCES mchat_sessions(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'scheduled', 'completed', 'cancelled')),

  -- Dados da submissão
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  risk_score INTEGER,
  risk_level TEXT,

  -- Follow-up
  contacted_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_waitlist_visitor ON waitlist(visitor_id);
CREATE INDEX idx_waitlist_session ON waitlist(session_id);
CREATE INDEX idx_waitlist_phone ON waitlist(phone_number);
CREATE INDEX idx_waitlist_status ON waitlist(status);
CREATE INDEX idx_waitlist_submitted_at ON waitlist(submitted_at);

-- ========================================
-- Tabela de Eventos (Event Tracking)
-- ========================================
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id UUID REFERENCES visitors(id) ON DELETE CASCADE,
  session_id UUID REFERENCES mchat_sessions(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,

  -- Tipo de evento
  event_type TEXT NOT NULL,
  event_data JSONB,

  -- Timestamp
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_visitor ON events(visitor_id);
CREATE INDEX idx_events_session ON events(session_id);
CREATE INDEX idx_events_phone ON events(phone_number);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_occurred_at ON events(occurred_at);
CREATE INDEX idx_events_data ON events USING GIN(event_data);

-- ========================================
-- Triggers para atualizar updated_at
-- ========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_visitors_updated_at BEFORE UPDATE ON visitors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mchat_sessions_updated_at BEFORE UPDATE ON mchat_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_waitlist_updated_at BEFORE UPDATE ON waitlist
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- Views para Métricas
-- ========================================

-- View: Métricas de Conversão
CREATE OR REPLACE VIEW metrics_conversion AS
SELECT
  COUNT(DISTINCT v.id) as total_visitors,
  COUNT(DISTINCT ms.id) as total_sessions_started,
  COUNT(DISTINCT CASE WHEN ms.status = 'completed' THEN ms.id END) as total_sessions_completed,
  COUNT(DISTINCT CASE WHEN ms.status = 'abandoned' THEN ms.id END) as total_sessions_abandoned,
  COUNT(DISTINCT w.id) as total_waitlist_submissions,

  -- Taxas de conversão
  ROUND(
    COUNT(DISTINCT ms.id)::NUMERIC / NULLIF(COUNT(DISTINCT v.id), 0) * 100,
    2
  ) as visitor_to_session_rate,

  ROUND(
    COUNT(DISTINCT CASE WHEN ms.status = 'completed' THEN ms.id END)::NUMERIC /
    NULLIF(COUNT(DISTINCT ms.id), 0) * 100,
    2
  ) as completion_rate,

  ROUND(
    COUNT(DISTINCT w.id)::NUMERIC /
    NULLIF(COUNT(DISTINCT CASE WHEN ms.status = 'completed' THEN ms.id END), 0) * 100,
    2
  ) as waitlist_conversion_rate

FROM visitors v
LEFT JOIN mchat_sessions ms ON v.id = ms.visitor_id
LEFT JOIN waitlist w ON v.id = w.visitor_id;

-- View: Tempo Médio de Conclusão
CREATE OR REPLACE VIEW metrics_timing AS
SELECT
  COUNT(*) as total_completed_sessions,
  ROUND(AVG(EXTRACT(EPOCH FROM (finished_at - started_at)) / 60), 2) as avg_completion_time_minutes,
  ROUND(MIN(EXTRACT(EPOCH FROM (finished_at - started_at)) / 60), 2) as min_completion_time_minutes,
  ROUND(MAX(EXTRACT(EPOCH FROM (finished_at - started_at)) / 60), 2) as max_completion_time_minutes
FROM mchat_sessions
WHERE status = 'completed' AND finished_at IS NOT NULL;

-- View: Drop-off por Pergunta
CREATE OR REPLACE VIEW metrics_dropoff_by_question AS
SELECT
  ms.current_question,
  COUNT(*) as sessions_reached,
  COUNT(CASE WHEN ms.status = 'abandoned' THEN 1 END) as sessions_abandoned,
  ROUND(
    COUNT(CASE WHEN ms.status = 'abandoned' THEN 1 END)::NUMERIC /
    NULLIF(COUNT(*), 0) * 100,
    2
  ) as abandonment_rate
FROM mchat_sessions ms
WHERE ms.status IN ('abandoned', 'completed')
GROUP BY ms.current_question
ORDER BY ms.current_question;

-- View: Métricas de Risco
CREATE OR REPLACE VIEW metrics_risk_distribution AS
SELECT
  risk_level,
  COUNT(*) as total_sessions,
  ROUND(COUNT(*)::NUMERIC / SUM(COUNT(*)) OVER () * 100, 2) as percentage,
  AVG(risk_score) as avg_risk_score,
  COUNT(CASE WHEN EXISTS (
    SELECT 1 FROM waitlist w WHERE w.session_id = mchat_sessions.id
  ) THEN 1 END) as waitlist_submissions,
  ROUND(
    COUNT(CASE WHEN EXISTS (
      SELECT 1 FROM waitlist w WHERE w.session_id = mchat_sessions.id
    ) THEN 1 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100,
    2
  ) as waitlist_rate
FROM mchat_sessions
WHERE status = 'completed' AND risk_level IS NOT NULL
GROUP BY risk_level
ORDER BY
  CASE risk_level
    WHEN 'alto' THEN 1
    WHEN 'moderado' THEN 2
    WHEN 'baixo' THEN 3
  END;

-- View: Sessões Abandonadas nas últimas 24h
CREATE OR REPLACE VIEW metrics_abandoned_24h AS
SELECT
  COUNT(*) as total_abandoned_24h,
  COUNT(DISTINCT visitor_id) as unique_visitors_abandoned,
  ROUND(AVG(current_question), 2) as avg_question_reached
FROM mchat_sessions
WHERE status = 'abandoned'
  AND last_activity_at >= NOW() - INTERVAL '24 hours';

-- ========================================
-- Função para marcar sessões como abandonadas
-- ========================================
CREATE OR REPLACE FUNCTION mark_abandoned_sessions()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE mchat_sessions
  SET status = 'abandoned'
  WHERE status IN ('started', 'in_progress')
    AND last_activity_at < NOW() - INTERVAL '24 hours'
    AND status != 'abandoned';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- Comentários nas tabelas
-- ========================================
COMMENT ON TABLE visitors IS 'Rastreamento de visitantes únicos do bot';
COMMENT ON TABLE mchat_sessions IS 'Sessões de triagem M-CHAT com métricas de progresso';
COMMENT ON TABLE mchat_answers IS 'Respostas individuais de cada questão do M-CHAT';
COMMENT ON TABLE waitlist IS 'Lista de espera para avaliação fisiológica';
COMMENT ON TABLE events IS 'Eventos gerais do sistema para tracking detalhado';
