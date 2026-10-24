const express = require('express');
const { pool } = require('../db');

const router = express.Router();



router.get('/', async (req, res) => {
    const { rows } = await pool.query(`
            SELECT p.*, c.name AS category_name,
                COALESCE((
                    SELECT json_agg(
                            json_build_object('id', s.id, 'name', s.name, 'cost_price', ps.cost_price)
                            ORDER BY s.name)
                    FROM product_suppliers ps
                    JOIN suppliers s ON s.id = ps.supplier_id
                    WHERE ps.product_id = p.id
                ), '[]'::json) AS suppliers
            FROM products p
            LEFT JOIN categories c ON c.id = p.category_id
            ORDER BY p.id DESC
        `);
        res.json(rows);
});

router.get('/low-stock', async (req, res) => {
    const { rows } = pool.query('SELECT * FROM low_stock_products');
    res.json(rows);
});

router.get('/:id', async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(rows[0]);
});

router.post('/', async (req, res) => {
    const { name, category_id, price, quantity, min_quantity } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
    if (!category_id) return res.status(400).json({ error: 'category_id é obrigatório' });

    const { rows } = await pool.query(
        `INSERT INTO products (name, category_id, price, quantity, min_quantity)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *`,
        [name, category_id, price || 0, quantity || 0, min_quantity || 0]
    );
    res.status(201).json(rows[0]);
});

router.put('/:id', async (req, res) => {
    const { name, category_id, price, min_quantity } = req.body;
    
    const { rows } = await pool.query(
        `UPDATE products
         SET name            = COALESCE($1, name), 
             category_id     = COALESCE($2, category_id), 
             price           = COALESCE($3, price), 
             min_quantity    = COALESCE($4, min_quantity)
         WHERE id = $5
         RETURNING *`,
         [name, category_id, price, min_quantity, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
    const result = await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Produto não encontrado' });
    res.status(204).send();
});



router.get('/:id/suppliers', async (req, res) => {
    const { rows } = await pool.query(
        `SELECT s.id, s.name, s.phone, s.email, ps.cost_price
         FROM product_suppliers ps
         JOIN suppliers s ON s.id = ps.supplier_id
         WHERE ps.product_id = $1
         ORDER BY s.name`,
        [req.params.id] 
    );
    res.json(rows);
});

router.post('/:id/suppliers', async (req, res) => {
    const { supplier_id, cost_price } = req.body;
    if (!supplier_id) return res.status(400).json({ error: 'supplier_id é obrigatório' });

    const { rows } = await pool.query(
        `INSERT INTO product_suppliers (product_id, supplier_id, cost_price)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [req.params.id, supplier_id, cost_price || 0] 
    );
    res.status(201).json(rows[0]);
});

router.put('/:id/suppliers/:supplierId', async (req, res) => {
    const { cost_price } = req.body;
    if (cost_price === undefined) return res.status(400).json({ error: 'cost_price é obrigatório' });

    const { rows } = await pool.query(
        `UPDATE product_suppliers
         SET cost_price = $1
         WHERE product_id = $2 AND supplier_id = $3
         RETURNING *`,
        [cost_price, req.params.id, req.params.supplierId] 
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Associação não encontrada' });
    res.json(rows[0]);
});

router.delete('/:id/suppliers/:supplierId', async (req, res) => {
    const result = await pool.query(
        'DELETE FROM product_suppliers WHERE product_id = $1 AND supplier_id = $2',
        [req.params.id, req.params.supplierId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Associação não encontrada' });
    res.status(204).send();
});

module.exports = router;