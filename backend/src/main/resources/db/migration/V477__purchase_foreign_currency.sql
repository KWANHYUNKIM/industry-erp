ALTER TABLE purchases ADD COLUMN currency_code varchar(10);
ALTER TABLE purchases ADD COLUMN exchange_rate numeric(18,4);
ALTER TABLE purchase_lines ADD COLUMN foreign_price numeric(18,4);
ALTER TABLE purchase_lines ADD COLUMN foreign_amount numeric(18,2);
ALTER TABLE purchase_lines ADD COLUMN line_rate numeric(18,4);
