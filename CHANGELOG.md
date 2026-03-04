# 📝 Changelog

## [1.1.0] - 2025-03-04

### ✨ Novas Funcionalidades

#### 🤖 Bot de WhatsApp Melhorado
- ✅ Mensagem de boas-vindas redesenhada e mais clara
- ✅ Menu com opções: "Saber mais" ou "Fazer triagem"
- ✅ Linguagem 100% voltada para pais (mais empática e acolhedora)
- ✅ Detecção simples de intenções (sem usar LLM)
- ✅ **Cancelamento de triagem a qualquer momento**
  - Palavras: "cancelar", "parar", "não quero mais", etc.
  - Sessão marcada como "abandoned" no banco
  - Respostas parciais mantidas para análise
- ✅ Informações sobre exame fisiológico da AUTherm
- ✅ Sistema de lista de espera funcional

#### 📊 Sistema Completo de Métricas
- ✅ Rastreamento de visitantes únicos
- ✅ Tracking de sessões M-CHAT
  - Status: started, in_progress, completed, abandoned
  - Tempo de início e conclusão
  - Progresso por pergunta
- ✅ Armazenamento de todas as respostas
  - Pergunta, resposta, se é risco
  - Tempo para responder cada pergunta
- ✅ Lista de espera com status
- ✅ Sistema de eventos customizados

#### 🗄️ Banco de Dados (Supabase)
- ✅ 5 tabelas principais:
  - `visitors` - Visitantes únicos
  - `mchat_sessions` - Sessões de triagem
  - `mchat_answers` - Respostas individuais
  - `waitlist` - Lista de espera
  - `events` - Eventos do sistema
- ✅ 5 views de métricas prontas:
  - `metrics_conversion` - Funil de conversão
  - `metrics_timing` - Tempo médio
  - `metrics_dropoff_by_question` - Abandono por pergunta
  - `metrics_risk_distribution` - Distribuição de risco
  - `metrics_abandoned_24h` - Abandono em 24h
- ✅ Função SQL para marcar sessões abandonadas
- ✅ Triggers automáticos para `updated_at`

#### 🔧 Serviços e Infraestrutura
- ✅ `AnalyticsService` - Serviço central de métricas
- ✅ `AnalyticsController` - API REST (opcional)
- ✅ `AnalyticsScheduler` - Cron jobs (opcional)
- ✅ Integração completa com Supabase
- ✅ Tratamento de erros e logs detalhados

### 🔄 Mudanças

#### Terminologia Corrigida
- ❌ "avaliação diagnóstica" → ✅ "avaliação fisiológica"
- ❌ "diagnóstico precoce" → ✅ "identificação precoce de sinais"
- ✅ Consistência em todos os arquivos

#### Fluxo do Bot Simplificado
- ❌ Detecção de intenção via LLM (removida)
- ✅ Detecção via regex/keywords (mais rápida e barata)
- ✅ Fluxo mais linear e intuitivo

#### M-CHAT Service
- ✅ Agora é assíncrono (suporta tracking)
- ✅ Rastreia tempo entre perguntas
- ✅ Salva sessionId do Supabase
- ✅ Armazena resultado para waitlist

### 📚 Documentação

#### Arquivos Criados
1. **`supabase/README.md`** - Setup completo do Supabase
   - Como criar projeto
   - Como executar migration
   - Queries úteis
   - Troubleshooting

2. **`METRICS.md`** - Documentação de métricas
   - Todas as métricas implementadas
   - Como acessar via código
   - Queries SQL úteis
   - Benchmarks recomendados

3. **`README.md`** - Documentação principal
   - Quick start
   - Estrutura do projeto
   - Troubleshooting

4. **`.env.example`** - Template de variáveis de ambiente

5. **`CHANGELOG.md`** - Este arquivo

#### Exemplos de Código
- ✅ Controller HTTP para métricas
- ✅ Scheduler para cron jobs
- ✅ Queries SQL úteis
- ✅ Snippets de código

### 🎯 Métricas Implementadas

#### 1. Total que iniciam
- **Métrica**: `session_started`
- **Tracking**: Automático ao iniciar M-CHAT
- **Como obter**: `SELECT COUNT(*) FROM mchat_sessions`

#### 2. Visitante → Início
- **Métrica**: `session_started / visitor_seen`
- **Como obter**: `SELECT visitor_to_session_rate FROM metrics_conversion`

#### 3. Conclusão
- **Métrica**: `session_completed / session_started`
- **Como obter**: `SELECT completion_rate FROM metrics_conversion`

#### 4. Tempo Médio
- **Métrica**: Média de `(finished_at - started_at)`
- **Como obter**: `SELECT * FROM metrics_timing`

#### 5. Abandono
- **Métricas**:
  - `abandoned_24h / session_started`
  - Drop-off por pergunta
- **Como obter**: `SELECT * FROM metrics_dropoff_by_question`

#### 6. Compreensão Clara ⏳
- **Status**: Não implementado (TODO)
- **Métrica**: `clarity_yes / session_completed`
- **Implementação futura**: Pergunta pós-resultado

#### 7. Intenção Avaliação
- **Métricas**:
  - `waitlist_yes / session_completed`
  - `waitlist_submitted`
- **Como obter**: `SELECT * FROM metrics_conversion`

### 🔒 Segurança

#### Implementado
- ✅ Variáveis de ambiente para segredos
- ✅ Logs detalhados para debugging
- ✅ Tratamento de erros

#### TODO
- ⏳ Row Level Security no Supabase
- ⏳ Autenticação em endpoints HTTP
- ⏳ Rate limiting
- ⏳ Validação de entrada

### 📦 Dependências Adicionadas
- `@supabase/supabase-js` - Cliente Supabase

### 🐛 Correções de Bugs
- ✅ Método `handleExamInterest` agora é assíncrono
- ✅ `answerQuestion` agora é assíncrono
- ✅ `startSession` recebe visitorId
- ✅ Chamadas assíncronas com await corretas

### 🚀 Performance
- ✅ Detecção de intenção mais rápida (regex vs LLM)
- ✅ Queries otimizadas com índices
- ✅ Views materializadas no Supabase

### 📁 Arquivos Modificados

#### Criados
```
src/analytics/analytics.service.ts
src/analytics/analytics.module.ts
src/analytics/analytics.controller.ts
src/analytics/analytics.scheduler.ts
supabase/migrations/20250304_create_metrics_tables.sql
supabase/README.md
METRICS.md
README.md
CHANGELOG.md
.env.example
```

#### Modificados
```
src/app.module.ts
src/whatsapp/whatsapp.module.ts
src/whatsapp/whatsapp.service.ts
src/whatsapp/mchat.service.ts
src/langgraph/agents/conversation.agent.ts
src/langgraph/constants/langgraph.constants.ts
package.json
```

---

## [1.0.0] - Versão Inicial

### Funcionalidades Base
- ✅ Conexão com WhatsApp via Baileys
- ✅ Questionário M-CHAT-R/F (20 perguntas)
- ✅ Cálculo de risco
- ✅ Agente de conversação com LangChain
- ✅ Histórico de conversas

---

**Notas de Migração**:

### De 1.0.0 para 1.1.0

1. Instale novas dependências:
   ```bash
   npm install @supabase/supabase-js
   ```

2. Configure Supabase:
   - Siga `supabase/README.md`
   - Execute migration SQL
   - Configure `.env`

3. **BREAKING CHANGES**:
   - `mchatService.startSession()` agora é assíncrono
   - `mchatService.answerQuestion()` agora é assíncrono
   - `whatsappService.handleExamInterest()` agora é assíncrono

4. Atualize chamadas para usar `await`:
   ```typescript
   // Antes
   const response = mchatService.startSession(userId);

   // Depois
   const response = await mchatService.startSession(userId, visitorId);
   ```

---

**Roadmap Futuro**:

### v1.2.0 (Planejado)
- [ ] Dashboard visual (Grafana/Metabase)
- [ ] Alertas automáticos
- [ ] Pergunta de compreensão pós-resultado
- [ ] Cohort analysis

### v1.3.0 (Planejado)
- [ ] A/B testing framework
- [ ] Análise de sentimento
- [ ] Webhooks para eventos
- [ ] API pública de métricas
