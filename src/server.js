require('dotenv').config();
const express = require('express');
const { initDb } = require('./db');

const productsRouter = require('./routes/products');
const movementsRouter = require('./routes/movements');
const catalogRouter = require('./routes/catalog');

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        message: 'API do Sistema de Estoque',
        endpoints: [
            'GET    /products',
            'GET    /products/low-stock',
            'GET    /products/:id',
            'POST   /products',
            'PUT    /products/:id',
            'DELETE /products/:id',
            'GET    /movements',
            'GET    /movements/product/:productId',
            'POST   /movements',
            'GET    /categories',
            'POST   /categories',
            'GET    /suppliers',
            'POST   /suppliers',
            'GET    /products/:id/suppliers',
            'POST   /products/:id/suppliers',
            'PUT    /products/:id/suppliers/:supplierId',
            'DELETE /products/:id/suppliers/:supplierId',
            'GET    /suppliers/:id/products',
        ],
    });
});

app.use('/products', productsRouter);
app.use('/movements', movementsRouter);
app.use('/', catalogRouter);

app.use((err, req, res, next) => {
    switch(err.code) {
        case '22P02':
            return res.status(400).json({ error: 'Valor inválido em um dos parâmetros' });
        case '23503':
            return res.status(409).json({
                error: 'Operação viola um relacionamento (registro referenciado não existe ou ainda está em uso)',
            });
        case '23505':
            return res.status(409).json({ error: 'Já existe um registro com esse valor' });
        case '23514':
            return res.status(400).json({ error: 'Valor não permitido pelas regras do banco' });
        default:
            console.error(err);
            return res.status(500).json({ error: 'Erro interno do servidor' });            
    }
});

const PORT = process.env.PORT || 3000;

initDb()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Servidor rodando em http://localhost:${PORT}`);
        });
    })
    .catch((err) => {
        console.error('Falha ao inicializar o banco de dados:', err.message);
        process.exit(1);
    });