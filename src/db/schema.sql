CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT
);

CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    price NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    min_quantity INTEGER NOT NULL DEFAULT 0 CONSTRAINT products_min_quantity_check CHECK (min_quantity >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE products ALTER COLUMN category_id SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'products_min_quantity_check'
            AND conrelid = 'products'::regclass
    ) THEN
      UPDATE products SET min_quantity = 0 WHERE min_quantity < 0;
      ALTER TABLE products ADD CONSTRAINT products_min_quantity_check CHECK (min_quantity >= 0);
    END IF;
END $$;      

CREATE TABLE IF NOT EXISTS movements (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    type TEXT NOT NULL CHECK (type IN ('IN', 'OUT')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_suppliers (
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    cost_price NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (product_id, supplier_id)
);



CREATE INDEX IF NOT EXISTS idx_product_suppliers_supplier_id ON product_suppliers(supplier_id);



CREATE OR REPLACE FUNCTION fn_update_stock() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.type = 'IN' THEN
        UPDATE products SET quantity = quantity + NEW.quantity WHERE id = NEW.product_id;
    ELSE
        UPDATE products SET quantity = quantity - NEW.quantity WHERE id = NEW.product_id;
    END IF;
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_movement_stock ON movements;
CREATE TRIGGER trg_movement_stock
AFTER INSERT ON movements
FOR EACH ROW
EXECUTE FUNCTION fn_update_stock();

CREATE OR REPLACE VIEW low_stock_products AS
SELECT p.id, p.name, p.quantity, p.min_quantity, c.name AS category
FROM products p
LEFT JOIN categories c ON c.id = p.category_id
WHERE p.quantity < p.min_quantity;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'products' AND column_name = 'supplier_id'
    ) THEN
      INSERT INTO product_suppliers (product_id, supplier_id)
        SELECT id, supplier_id FROM products WHERE supplier_id IS NOT NULL
        ON CONFLICT DO NOTHING;
      ALTER TABLE products DROP COLUMN supplier_id;
    END IF;
END $$;