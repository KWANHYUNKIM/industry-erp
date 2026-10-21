ALTER TABLE payment_agencies ADD COLUMN currency_id bigint REFERENCES currencies(id);
CREATE INDEX idx_payment_agencies_currency_id ON payment_agencies(currency_id);
