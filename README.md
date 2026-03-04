# 🧩 AUTherm WhatsApp Bot

Bot de WhatsApp para triagem M-CHAT-R/F com sistema completo de métricas e lista de espera.

## 📋 Funcionalidades

### 🤖 Bot de WhatsApp
- ✅ Mensagem de boas-vindas amigável e direta
- ✅ Informações sobre a AUTherm
- ✅ Triagem M-CHAT-R/F (20 perguntas)
- ✅ **Cancelamento de triagem a qualquer momento**
- ✅ Resultados com orientações personalizadas
- ✅ Lista de espera para avaliação fisiológica
- ✅ Linguagem 100% voltada para pais

### 📊 Sistema de Métricas
- ✅ Rastreamento de visitantes únicos
- ✅ Funil de conversão completo
- ✅ Tempo médio de conclusão
- ✅ Taxa de abandono (geral e por pergunta)
- ✅ Distribuição de risco
- ✅ Lista de espera com status
- ✅ Armazenamento de todas as respostas

## 🚀 Quick Start

### 1. Instalação

```bash
# Clonar repositório
git clone <repo-url>
cd autherm-whatsapp

# Instalar dependências
npm install
```

### 2. Configurar Variáveis de Ambiente

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

Edite `.env`:
```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Supabase (opcional, mas recomendado para métricas)
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=eyJ...
```

### 3. Configurar Supabase (Métricas)

Siga as instruções em [`supabase/README.md`](./supabase/README.md):

1. Crie um projeto no Supabase
2. Execute a migration SQL
3. Configure as variáveis de ambiente
4. Teste a conexão

**Nota**: O bot funciona sem Supabase, mas as métricas não serão armazenadas.

### 4. Iniciar o Bot

```bash
# Desenvolvimento
npm run dev

# Produção
npm run build
npm run start:prod
```

### 5. Conectar WhatsApp

1. Aguarde o QR Code aparecer no terminal
2. Abra o WhatsApp no celular
3. Vá em **Configurações** → **Aparelhos conectados**
4. Escaneie o QR Code

Pronto! O bot está ativo. 🎉

## 📊 Métricas

Para detalhes completos sobre as métricas, veja [`METRICS.md`](./METRICS.md).

### Métricas Disponíveis

| Métrica | Descrição | Como Obter |
|---------|-----------|------------|
| **Total que iniciam** | `session_started` | `SELECT COUNT(*) FROM mchat_sessions` |
| **Visitante → Início** | Taxa de conversão | `SELECT * FROM metrics_conversion` |
| **Conclusão** | `completed / started` | `SELECT completion_rate FROM metrics_conversion` |
| **Tempo Médio** | Média de conclusão | `SELECT * FROM metrics_timing` |
| **Abandono** | Taxa e por pergunta | `SELECT * FROM metrics_dropoff_by_question` |
| **Conversão Waitlist** | `waitlist / completed` | `SELECT * FROM metrics_conversion` |

### Acessar Dashboard

```typescript
// Via código
const metrics = await analyticsService.getConversionMetrics();
console.log(metrics);

// Ou via SQL direto no Supabase
SELECT * FROM metrics_conversion;
```

## 📁 Estrutura do Projeto

```
autherm-whatsapp/
├── src/
│   ├── analytics/              # Sistema de métricas
│   │   ├── analytics.service.ts
│   │   ├── analytics.module.ts
│   │   ├── analytics.controller.ts   # API REST (opcional)
│   │   └── analytics.scheduler.ts    # Cron jobs (opcional)
│   ├── whatsapp/               # Serviços do WhatsApp
│   │   ├── whatsapp.service.ts
│   │   ├── mchat.service.ts
│   │   └── whatsapp.module.ts
│   ├── langgraph/              # Agentes de IA
│   │   └── agents/
│   └── app.module.ts
├── supabase/
│   ├── migrations/
│   │   └── 20250304_create_metrics_tables.sql
│   └── README.md               # Setup do Supabase
├── METRICS.md                  # Documentação de métricas
├── .env.example
├── package.json
└── README.md                   # Este arquivo
```

## 🔧 Desenvolvimento

### Adicionar Nova Métrica

1. Adicione campo na migration SQL (se necessário)
2. Atualize `analytics.service.ts` com novo método
3. Documente em `METRICS.md`

### Expor Métricas via API

Para criar endpoints HTTP para as métricas:

1. Descomente `@Controller` em `analytics.controller.ts`
2. Adicione o controller no `analytics.module.ts`:
   ```typescript
   @Module({
     controllers: [AnalyticsController],
     providers: [AnalyticsService],
     exports: [AnalyticsService],
   })
   ```
3. Acesse `http://localhost:3000/analytics/dashboard`

**⚠️ IMPORTANTE**: Em produção, adicione autenticação!

### Automatizar Limpeza de Dados

Para marcar sessões abandonadas automaticamente:

1. Instale: `npm install @nestjs/schedule`
2. Adicione `ScheduleModule.forRoot()` no `app.module.ts`
3. Descomente código em `analytics.scheduler.ts`
4. Adicione o scheduler no `analytics.module.ts`

## 📈 Queries Úteis

### Dashboard Básico

```sql
SELECT * FROM metrics_conversion;
```

### Perguntas com Maior Abandono

```sql
SELECT *
FROM metrics_dropoff_by_question
ORDER BY abandonment_rate DESC
LIMIT 5;
```

### Lista de Espera Pendente

```sql
SELECT phone_number, risk_level, submitted_at
FROM waitlist
WHERE status = 'pending'
ORDER BY submitted_at ASC;
```

### Respostas de Risco Mais Comuns

```sql
SELECT question_id, COUNT(*) as total
FROM mchat_answers
WHERE is_risk = true
GROUP BY question_id
ORDER BY total DESC
LIMIT 10;
```

## 🛠️ Troubleshooting

### Bot não conecta ao WhatsApp

1. Certifique-se que o WhatsApp está ativo no celular
2. Apague a pasta `auth/` e reinicie o bot
3. Escaneie o novo QR Code

### Métricas não aparecem

1. Verifique se o Supabase está configurado:
   ```bash
   echo $SUPABASE_URL
   ```
2. Verifique logs do bot:
   - ✅ Deve aparecer: "Analytics habilitado com Supabase"
   - ⚠️ Se aparecer: "Supabase não configurado"
3. Teste no Supabase:
   ```sql
   SELECT COUNT(*) FROM visitors;
   ```

### Erros de TypeScript

```bash
npm run build
```

Se houver erros, verifique:
- Todas as dependências instaladas
- Versão do Node.js (recomendado: 20+)

## 📦 Dependências Principais

- **@nestjs/core**: Framework backend
- **@whiskeysockets/baileys**: Cliente WhatsApp
- **@langchain/openai**: Agentes de IA
- **@supabase/supabase-js**: Cliente Supabase
- **pino**: Logging
- **qrcode-terminal**: QR Code no terminal

## 🔒 Segurança

### Produção

- [ ] Adicione autenticação nos endpoints HTTP
- [ ] Configure Row Level Security no Supabase
- [ ] Use variáveis de ambiente para segredos
- [ ] Configure rate limiting
- [ ] Adicione validação de entrada

### Supabase RLS

```sql
ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON visitors
  FOR ALL
  USING (auth.role() = 'service_role');
```

## 📞 Suporte

- **Issues**: Abra uma issue neste repositório
- **Documentação**: Veja `METRICS.md` e `supabase/README.md`
- **Supabase**: [docs.supabase.com](https://docs.supabase.com)

## 📄 Licença

[Adicione sua licença aqui]

## 🙏 Créditos

Desenvolvido para AUTherm - Apoiando famílias no diagnóstico precoce do autismo.

---

**Status do Projeto**: ✅ Em Produção

**Última Atualização**: 04/03/2025
