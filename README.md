# MockTree

Uma ferramenta inteligente para popular bancos de dados PostgreSQL com dados fictícios, respeitando relacionamentos de Foreign Keys e dependências entre tabelas.

## 🎯 Funcionalidades Principais

- **Descoberta Automática de Estrutura**: Analisa automaticamente schemas, tabelas e relacionamentos
- **Mapeamento de Dependências**: Constrói árvore de relacionamentos FK automaticamente
- **Inserção Inteligente**: Insere dados respeitando a ordem de dependências
- **Cache de IDs**: Mantém cache de IDs inseridos para referências FK
- **Geração de Dados Realistas**: Gera valores apropriados para cada tipo de dado
- **Sistema de Logs Detalhado**: Relatórios completos de sucesso e falhas
- **Tratamento de Erros Robusto**: Identificação inteligente de problemas

## 🏗️ Arquitetura do Projeto

```
.
├── index.js                 # Arquivo principal - interface CLI
├── scanner.js               # Utilitário para análise de tipos de dados
├── src/
│   ├── db.js               # Configuração da conexão PostgreSQL
│   ├── foreignKeys.js      # Exploração da árvore de relacionamentos
│   ├── generateRandomValues.js # Geração de valores fictícios
│   ├── insert.js           # Sistema de inserção inteligente
│   └── queries.js          # Queries SQL e descoberta de estruturas
├── package.json            # Dependências do projeto
└── .env                    # Configurações do banco (não incluído)
```

## 🚀 Como Usar

### 1. Pré-requisitos

- Node.js (versão 16 ou superior)
- PostgreSQL
- Acesso de leitura/escrita ao banco de dados

### 2. Instalação

```bash
# Clone o repositório
git clone <url-do-repositorio>
cd MockTree

# Instale as dependências
npm install
```

### 3. Configuração

Renomea arquivo `.env_template` para `.env` na raiz do projeto e preencha os dados:

```env
DB_HOST=localhost
DB_USER=seu_usuario
DB_PASS=sua_senha
DB_NAME=nome_do_banco
DB_PORT=5432
```

### 4. Execução

```bash
# Executar a ferramenta principal
node index.js

# Analisar tipos de dados do banco
node scanner.js
```

### 5. Processo Interativo

1. O sistema perguntará o nome da tabela inicial
2. Analisa automaticamente a estrutura do banco
3. Explora dependências FK da tabela
4. Insere dados em ordem de dependência
5. Exibe relatório final com estatísticas

## 🔧 Funcionalidades Técnicas

### Descoberta Automática de Estrutura

```javascript
// Encontra tabela em qualquer schema
const tableInfo = await findTableInDatabase('usuarios');

// Analisa estrutura completa da tabela
const analysis = await analyzeTableStructure('public', 'usuarios');
```

### Sistema de Cache Inteligente

- Mantém IDs inseridos em memória
- Reutiliza IDs para referências FK
- Evita dependências circulares
- Otimiza performance

### Geração de Dados por Tipo

| Tipo de Dado | Estratégia de Geração |
|--------------|----------------------|
| UUID | `gen_random_uuid()` |
| Integer/BigInt | Valores randômicos respeitando limites |
| String/Text | Strings alfanuméricas com tamanho apropriado |
| Numeric/Decimal | Valores decimais com precisão |
| Boolean | Valores randômicos true/false |
| Timestamp | `NOW()` |
| JSON/JSONB | Objetos JSON válidos |

### Tratamento de Erros

- **23503**: Violação de Foreign Key
- **23505**: Violação de constraint UNIQUE  
- **23514**: Violação de constraint CHECK
- Logs detalhados com sugestões de correção

## 📊 Exemplo de Uso

```bash
$ node index.js
✅ Conectado ao banco de dados
🔍 Analisando estrutura do banco de dados...
📊 Schemas encontrados: public, audit

Digite o nome da tabela inicial: pedidos

🎯 PROCESSANDO TABELA: pedidos
🔍 Explorando dependências (FKs) da tabela...
📊 Encontradas 2 dependências FK

🚀 FASE 1: Inserindo dependências...

📋 Dependência: public.pedidos -> public.usuarios
🎯 FK detectado: usuario_id -> public.usuarios
✅ INSERT executado com sucesso! ID: 123

📋 Dependência: public.pedidos -> public.produtos  
🎯 FK detectado: produto_id -> public.produtos
✅ INSERT executado com sucesso! ID: 456

🚀 FASE 2: Inserindo na tabela principal...
🎯 INSERINDO NA TABELA PRINCIPAL: pedidos
✅ Tabela encontrada: public.pedidos
🆔 ID gerado: 789

============================================================
📊 RELATÓRIO FINAL
============================================================
🎯 Tabela alvo: pedidos
✅ INSERTs executados com sucesso: 3
❌ INSERTs com falha: 0
📈 Total processado: 3

🎊 RESUMO DOS SUCESSOS:
   📋 Dependências inseridas: 2
   🎯 Tabela principal inserida: 1

🚀 Total: 3 registros criados no banco!
============================================================
```

## 🛡️ Segurança e Boas Práticas

- **Prepared Statements**: Todas as queries usam parâmetros seguros
- **Validação de Tipos**: Validação rigorosa de tipos de dados
- **Tratamento de Overflow**: Limites conservadores para evitar overflow
- **Conexão Segura**: Suporte a SSL (configurável)
- **Graceful Shutdown**: Finalização limpa em caso de interrupção

## 🔄 Fluxo de Processamento

1. **Conexão**: Estabelece conexão com PostgreSQL
2. **Descoberta**: Analisa schemas e estruturas
3. **Validação**: Verifica existência da tabela informada
4. **Mapeamento**: Constrói árvore de dependências FK
5. **Inserção Hierárquica**: 
   - Insere dependências primeiro
   - Mantém cache de IDs gerados
   - Insere tabela principal por último
6. **Relatório**: Exibe estatísticas detalhadas

## 🎛️ Configurações Avançadas

### Mapeamento Personalizado de Colunas

```javascript
// Adicionar mapeamento específico
addColumnMapping('EstadoCivilCaracteristicaId', 'CaracteristicaId');
```

### Configurações de Ambiente

```env
# Modo de desenvolvimento (logs detalhados)
NODE_ENV=development

# Configurações SSL (produção)
DB_SSL=true
```

## 📝 Tecnologias Utilizadas

- **Node.js**: Runtime JavaScript
- **PostgreSQL** (`pg`): Cliente PostgreSQL oficial
- **dotenv**: Gerenciamento de variáveis de ambiente
- **readline**: Interface de linha de comando interativa

📋 Roadmap / Funcionalidades Futuras
🎯 Versão 2.0 - Expansão de Compatibilidade

 Multi-Database Support: Suporte completo para MySQL, SQL Server, SQLite, Oracle
 Adaptadores de Banco: Sistema de adaptadores para diferentes SGBDs
 Auto-detecção de SGBD: Identificação automática do tipo de banco
 Queries Universais: Sistema de queries que se adapta ao dialeto SQL

📦 Versão 2.1 - Distribuição NPM

 Publicação NPM: Disponibilizar como pacote @mocktree/core
 CLI Global: Instalar globalmente com npm install -g mocktree
 API Programática: Usar como biblioteca em outros projetos
 TypeScript Support: Tipagens completas para melhor DX
 ESM/CommonJS: Suporte a ambos os formatos de módulo

🎨 Versão 3.0 - Interface Visual

 Dashboard Web: Interface visual para gerenciar população
 Visualização de Árvore: Gráfico interativo das dependências FK
 Editor de Schemas: Interface para mapear e configurar tabelas
 Histórico de Execuções: Log visual das operações realizadas
 Templates Visuais: Criador drag-and-drop de templates

🛠️ Versão 3.1 - Gestão Avançada

 Profiles de Configuração: Múltiplos perfis para diferentes ambientes
 Quantidade Configurável: Definir quantos registros inserir por tabela
 Estratégias de Inserção: Diferentes modos (bulk, individual, transaction)
 Validação Prévia: Verificação de estrutura antes da execução
 Rollback Inteligente: Desfazer operações em caso de erro

🎭 Versão 4.0 - Templates e Personalização

 Templates de Domínio: E-commerce, CRM, ERP, Blog, etc.
 Dados Localizados: Suporte a diferentes idiomas e regiões
 Faker.js Integration: Integração com bibliotecas de dados falsos
 Custom Generators: Sistema de plugins para geradores personalizados
 Seed Files: Importar dados de arquivos CSV, JSON, SQL

🔄 Versão 4.1 - Automação e Integração

 CI/CD Integration: Plugins para GitHub Actions, Jenkins, etc.
 Docker Support: Containers para execução isolada
 API REST: Serviço web para integração com outras ferramentas
 Webhooks: Notificações automáticas após execução
 Scheduled Jobs: Execução programada e recorrente

🧪 Versão 5.0 - Testing & Quality

 Test Data Management: Gerenciamento completo de dados de teste
 Environment Sync: Sincronizar dados entre ambientes
 Data Anonymization: Anonimizar dados sensíveis para testes
 Performance Testing: Dados otimizados para testes de performance
 Compliance Mode: Modo compatível com LGPD/GDPR

⚡ Funcionalidades Experimentais

 AI-Powered Data: IA para gerar dados mais realistas
 Schema Learning: Aprendizado automático de padrões de dados
 Smart Relationships: Detecção inteligente de relacionamentos implícitos
 Natural Language: Comandos em linguagem natural
 Real-time Streaming: População em tempo real para testes

🌐 Ecossistema MockTree

 MockTree Studio: IDE completo para gestão de dados
 MockTree Cloud: Serviço em nuvem para equipes
 MockTree Marketplace: Marketplace de templates e plugins
 MockTree Academy: Cursos e documentação avançada

⚠️ Avisos Importantes

Use apenas em ambientes de desenvolvimento/teste
Sempre faça backup antes de executar em dados importantes
Verifique permissões de usuário do banco
Teste com dados pequenos primeiro

📄 Licença
ISC License - Veja arquivo LICENSE para detalhes.
---

**Desenvolvido com ❤️ para facilitar o desenvolvimento e testes de aplicações**