# Setup do Supabase - Sistema de Métricas AUTherm

Este documento explica como configurar o Supabase para rastrear métricas do bot de WhatsApp.

## 📋 Pré-requisitos

1. Conta no [Supabase](https://supabase.com)
2. Node.js instalado
3. Bot de WhatsApp configurado

## 🚀 Configuração Inicial

### 1. Criar Projeto no Supabase

1. Acesse [app.supabase.com](https://app.supabase.com)
2. Clique em "New Project"
3. Preencha:
   - **Name**: autherm-whatsapp
   - **Database Password**: (escolha uma senha segura)
   - **Region**: Escolha a mais próxima do Brasil
4. Clique em "Create new project"

### 2. Executar Migration SQL

1. No painel do Supabase, vá em **SQL Editor**
2. Clique em **New Query**
3. Copie todo o conteúdo do arquivo `migrations/20250304_create_metrics_tables.sql`
4. Cole no editor e clique em **Run**
5. Aguarde até ver "Success. No rows returned"

### 3. Configurar Variáveis de Ambiente

1. No painel do Supabase, vá em **Settings** → **API**
2. Copie os valores:
   - **Project URL**: `SUPABASE_URL`
   - **anon/public**: `SUPABASE_ANON_KEY`

3. Crie ou edite o arquivo `.env` na raiz do projeto:

```bash
# OpenAI
OPENAI_API_KEY=sua_chave_aqui

# Supabase
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua_chave_anon_aqui
```

### 4. Testar Conexão

Execute o bot e envie uma mensagem. Verifique:

1. No terminal, deve aparecer: `✅ Analytics habilitado com Supabase`
2. No Supabase, vá em **Table Editor** e verifique se apareceu um registro na tabela `visitors`

## 📊 Métricas Disponíveis

### Tabelas Principais

#### 1. `visitors`
Rastreia usuários únicos do bot
- `phone_number`: Número de telefone
- `first_seen_at`: Primeira vez que interagiu
- `last_seen_at`: Última interação
- `total_interactions`: Número de interações

#### 2. `mchat_sessions`
Sessões de triagem M-CHAT
- `status`: started, in_progress, completed, abandoned
- `current_question`: Pergunta atual
- `risk_score`: Pontuação de risco (0-20)
- `risk_level`: baixo, moderado, alto
- `started_at`, `finished_at`: Timestamps

#### 3. `mchat_answers`
Respostas individuais de cada pergunta
- `question_id`: ID da pergunta (1-20)
- `user_response`: sim ou nao
- `is_risk`: Se é resposta de risco
- `time_to_answer_seconds`: Tempo para responder

#### 4. `waitlist`
Lista de espera para avaliação fisiológica
- `phone_number`: Telefone do interessado
- `risk_score`: Pontuação da triagem
- `status`: pending, contacted, scheduled, completed

#### 5. `events`
Eventos gerais do sistema
- `event_type`: Tipo de evento
- `event_data`: Dados JSON do evento

### Views de Métricas

#### `metrics_conversion`
Taxas de conversão
```sql
SELECT * FROM metrics_conversion;
```
Retorna:
- `total_visitors`: Total de visitantes
- `total_sessions_started`: Sessões iniciadas
- `total_sessions_completed`: Sessões completadas
- `visitor_to_session_rate`: Taxa visitante → início (%)
- `completion_rate`: Taxa de conclusão (%)
- `waitlist_conversion_rate`: Taxa de conversão para lista de espera (%)

#### `metrics_timing`
Tempo médio de conclusão
```sql
SELECT * FROM metrics_timing;
```
Retorna:
- `avg_completion_time_minutes`: Tempo médio em minutos
- `min_completion_time_minutes`: Tempo mínimo
- `max_completion_time_minutes`: Tempo máximo

#### `metrics_dropoff_by_question`
Abandono por pergunta
```sql
SELECT * FROM metrics_dropoff_by_question
ORDER BY current_question;
```
Retorna para cada pergunta:
- `sessions_reached`: Quantas sessões chegaram nessa pergunta
- `sessions_abandoned`: Quantas abandonaram
- `abandonment_rate`: Taxa de abandono (%)

#### `metrics_risk_distribution`
Distribuição de risco
```sql
SELECT * FROM metrics_risk_distribution;
```
Retorna para cada nível de risco:
- `total_sessions`: Total de sessões
- `percentage`: Porcentagem (%)
- `avg_risk_score`: Pontuação média
- `waitlist_submissions`: Quantos entraram na lista de espera
- `waitlist_rate`: Taxa de conversão para lista (%)

#### `metrics_abandoned_24h`
Abandono nas últimas 24h
```sql
SELECT * FROM metrics_abandoned_24h;
```

## 🔧 Funções Úteis

### Marcar Sessões Abandonadas
Execute periodicamente (ex: a cada hora) para marcar sessões inativas como abandonadas:

```sql
SELECT mark_abandoned_sessions();
```

Retorna o número de sessões marcadas como abandonadas.

## 📈 Queries Úteis

### Total de usuários que iniciaram vs concluíram
```sql
SELECT
  COUNT(DISTINCT CASE WHEN status != 'started' THEN id END) as iniciaram,
  COUNT(DISTINCT CASE WHEN status = 'completed' THEN id END) as concluiram
FROM mchat_sessions;
```

### Taxa de conclusão por dia
```sql
SELECT
  DATE(started_at) as dia,
  COUNT(*) as total_iniciadas,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as total_concluidas,
  ROUND(COUNT(CASE WHEN status = 'completed' THEN 1 END)::NUMERIC / COUNT(*) * 100, 2) as taxa_conclusao
FROM mchat_sessions
GROUP BY DATE(started_at)
ORDER BY dia DESC;
```

### Lista de espera pendente
```sql
SELECT
  w.phone_number,
  w.risk_level,
  w.risk_score,
  w.submitted_at,
  EXTRACT(DAY FROM NOW() - w.submitted_at) as dias_esperando
FROM waitlist w
WHERE w.status = 'pending'
ORDER BY w.submitted_at ASC;
```

### Respostas de risco mais comuns
```sql
SELECT
  question_id,
  question_text,
  COUNT(*) as total_respostas_risco,
  ROUND(COUNT(*)::NUMERIC / (SELECT COUNT(DISTINCT session_id) FROM mchat_answers) * 100, 2) as percentual
FROM mchat_answers
WHERE is_risk = true
GROUP BY question_id, question_text
ORDER BY total_respostas_risco DESC
LIMIT 10;
```

## 🔒 Segurança

### Row Level Security (RLS)

As tabelas estão sem RLS para facilitar o desenvolvimento. Para produção, considere adicionar:

```sql
-- Ativar RLS
ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE mchat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mchat_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Política de exemplo (apenas service role pode acessar)
CREATE POLICY "Service role only" ON visitors
  FOR ALL
  USING (auth.role() = 'service_role');
```

## 📊 Dashboard Recomendado

Para visualizar as métricas, recomendamos criar um dashboard com:

### KPIs Principais
1. **Visitante → Início**: `session_started / visitor_seen`
2. **Taxa de Conclusão**: `session_completed / session_started`
3. **Tempo Médio**: Média de `(finished_at - started_at)`
4. **Taxa de Abandono 24h**: `abandoned_24h / session_started`
5. **Conversão Waitlist**: `waitlist_submitted / session_completed`

### Gráficos
1. Funil de conversão (Visitantes → Início → Conclusão → Waitlist)
2. Drop-off por pergunta (gráfico de linha)
3. Distribuição de risco (gráfico de pizza)
4. Tendência de conclusões ao longo do tempo (gráfico de linha)

## 🛠️ Manutenção

### Backup
Configure backups automáticos em **Settings** → **Database** → **Backups**

### Monitoramento
- Ative alertas em **Settings** → **Reports**
- Configure webhooks para eventos importantes

### Limpeza de Dados
Execute periodicamente para limpar dados antigos:

```sql
-- Deletar eventos com mais de 90 dias
DELETE FROM events
WHERE occurred_at < NOW() - INTERVAL '90 days';

-- Deletar sessões abandonadas com mais de 30 dias
DELETE FROM mchat_sessions
WHERE status = 'abandoned'
AND last_activity_at < NOW() - INTERVAL '30 days';
```

## 📞 Suporte

Para problemas:
1. Verifique os logs do Supabase em **Logs**
2. Verifique os logs do bot no terminal
3. Teste as queries manualmente no SQL Editor

## 🚀 Próximos Passos

1. Configure um cron job para marcar sessões abandonadas
2. Crie um dashboard no Supabase ou ferramenta de BI
3. Configure alertas para métricas importantes
4. Implemente análises avançadas (cohort analysis, retention, etc.)
