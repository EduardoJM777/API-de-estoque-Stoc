# Sistema de Estoque com Auditoria — API (PostgreSQL)

API REST em Node.js + Express integrada ao PostgreSQL, com trigger PL/pgSQL
de atualização automática de estoque, view de relatório, relacionamento N:N
entre produtos e fornecedores e movimentações transacionais com lock de linha.

## Pré-requisitos
- Node.js 18+
- PostgreSQL 11+ rodando localmente

## Como rodar

1. Crie o banco (uma vez):
   ```bash
   psql -U postgres -c "CREATE DATABASE estoque;"
   ```
2. Configure a conexão:
   ```bash
   cp .env.example .env
   # edite .env: DATABASE_URL=postgres://usuario:senha@localhost:5432/estoque
   ```
3. Instale e inicie:
   ```bash
   npm install
   npm start
   ```

As tabelas, a função do trigger, o trigger, a view e os índices são criados
automaticamente na inicialização (o `schema.sql` é idempotente).

## Modelo de dados

| Tabela | Finalidade |
|---|---|
| `categories` | Categorias de produtos |
| `suppliers` | Fornecedores |
| `products` | Produtos (preço, saldo atual, estoque mínimo) |
| `product_suppliers` | Associação N:N entre produtos e fornecedores, com o preço de custo |
| `movements` | Histórico de entradas (`IN`) e saídas (`OUT`), usado como log de auditoria |

### Relacionamentos

| Relacionamento | Cardinalidade | Ao excluir o registro pai |
|---|---|---|
| Categoria → Produto (`products.category_id`, opcional) | 1:N | Bloqueia a exclusão |
| Produto ↔ Fornecedor (`product_suppliers`) | N:N | Produto: apaga as associações (`CASCADE`). Fornecedor: bloqueia (`RESTRICT`) |
| Produto → Movimentação (`movements.product_id`, obrigatório) | 1:N | Bloqueia a exclusão |

Um produto pode ter vários fornecedores e um fornecedor pode atender vários
produtos. A chave primária composta `(product_id, supplier_id)` impede a mesma
associação duas vezes, e o preço de custo (`cost_price`) fica na associação,
porque depende de qual fornecedor vende o item.

### Trigger de auditoria
Toda vez que uma linha é inserida em `movements`, o trigger `trg_movement_stock`
(função `fn_update_stock()`) atualiza automaticamente `products.quantity`.
O saldo só muda através do histórico de movimentações, o que garante
rastreabilidade. A única exceção é a quantidade informada no cadastro do
produto, que é o saldo inicial e não gera movimentação.

### View de relatório
`low_stock_products` lista produtos cujo saldo está abaixo do mínimo
configurado, com o nome da categoria.

### Migração de bancos existentes
Se o banco foi criado por uma versão anterior (quando `products` tinha a coluna
`supplier_id`), a inicialização copia cada vínculo para `product_suppliers` e
remove a coluna, sem perder produtos, saldos ou histórico. Em banco novo, esse
passo não faz nada, e reiniciar o servidor várias vezes é seguro.

## Endpoints

### Cadastros

| Método | Rota | Descrição |
|---|---|---|
| GET | `/categories` | Lista categorias |
| POST | `/categories` | Cria categoria |
| GET | `/suppliers` | Lista fornecedores |
| POST | `/suppliers` | Cria fornecedor |
| GET | `/suppliers/:id/products` | Lista os produtos de um fornecedor |

### Produtos

| Método | Rota | Descrição |
|---|---|---|
| GET | `/products` | Lista produtos, com categoria e array `suppliers` |
| GET | `/products/low-stock` | Relatório de estoque baixo |
| GET | `/products/:id` | Detalhe de um produto |
| POST | `/products` | Cria produto |
| PUT | `/products/:id` | Atualiza dados cadastrais (não altera o saldo) |
| DELETE | `/products/:id` | Remove produto (e suas associações com fornecedores) |

### Fornecedores de um produto

| Método | Rota | Descrição |
|---|---|---|
| GET | `/products/:id/suppliers` | Lista os fornecedores do produto |
| POST | `/products/:id/suppliers` | Associa um fornecedor (`supplier_id`, `cost_price`) |
| PUT | `/products/:id/suppliers/:supplierId` | Atualiza o preço de custo |
| DELETE | `/products/:id/suppliers/:supplierId` | Remove a associação |

### Movimentações

| Método | Rota | Descrição |
|---|---|---|
| GET | `/movements` | Histórico completo |
| GET | `/movements/product/:productId` | Histórico de um produto |
| POST | `/movements` | Registra entrada ou saída de estoque |

## Exemplo de uso (curl)

```bash
# Criar categoria e fornecedor
curl -X POST localhost:3000/categories -H "Content-Type: application/json" \
  -d '{"name":"Eletrônicos"}'
curl -X POST localhost:3000/suppliers -H "Content-Type: application/json" \
  -d '{"name":"Fornecedor ABC","phone":"11999998888","email":"contato@abc.com"}'

# Criar produto (não recebe mais supplier_id)
curl -X POST localhost:3000/products -H "Content-Type: application/json" \
  -d '{"name":"Mouse sem fio","category_id":1,"price":49.9,"quantity":5,"min_quantity":10}'

# Associar o fornecedor ao produto, com preço de custo
curl -X POST localhost:3000/products/1/suppliers -H "Content-Type: application/json" \
  -d '{"supplier_id":1,"cost_price":30.5}'

# Registrar entrada e saída de estoque
curl -X POST localhost:3000/movements -H "Content-Type: application/json" \
  -d '{"product_id":1,"type":"IN","quantity":20,"reason":"Compra fornecedor"}'
curl -X POST localhost:3000/movements -H "Content-Type: application/json" \
  -d '{"product_id":1,"type":"OUT","quantity":3,"reason":"Venda"}'
```

## Códigos de resposta

| Código | Quando |
|---|---|
| 201 | Registro criado |
| 204 | Registro excluído |
| 400 | Dado inválido ou ausente, estoque insuficiente, id mal formado, valor negativo |
| 404 | Produto ou associação não encontrados |
| 409 | Conflito de integridade: associação duplicada, produto ou fornecedor inexistente numa associação, exclusão de registro ainda referenciado |
| 500 | Falha interna (detalhes apenas no log do servidor) |

## Mudanças em relação à versão com um fornecedor por produto

- `POST /products` e `PUT /products/:id` **não aceitam mais `supplier_id`**; o
  campo é ignorado. O vínculo passa a ser feito em `POST /products/:id/suppliers`.
- `GET /products` deixa de trazer `supplier_name` e passa a trazer `suppliers`:
  um array com `id`, `name` e `cost_price` (vazio quando o produto não tem
  fornecedor).

## O que mudou em relação à versão SQLite

| Tema | SQLite (antes) | PostgreSQL (agora) |
|---|---|---|
| Driver | `better-sqlite3` (síncrono) | `pg` com `Pool` (assíncrono, `async/await`) |
| Placeholders | `?` | `$1, $2, ...` |
| Chave primária | `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` |
| Preço | `REAL` | `NUMERIC(10,2)` (convertido para número no driver) |
| Datas | `TEXT` + `datetime('now')` | `TIMESTAMPTZ` + `NOW()` |
| Trigger | corpo inline (2 triggers) | função PL/pgSQL `fn_update_stock()` + 1 trigger |
| Estoque negativo | validado só na rota | `CHECK (quantity >= 0)` também no banco |
| Concorrência | sem proteção | transação + `SELECT ... FOR UPDATE` |
| Retorno de INSERT/UPDATE | `lastInsertRowid` + novo SELECT | `RETURNING *` |
| Erros do banco | HTTP 500 genérico | `23503`/`23505`→409, `22P02`/`23514`→400 |
