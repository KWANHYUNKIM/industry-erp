-- 고정자산증가·감소 전표의 [수수료] · [거래처] · 감소의 [처분손익계정](원본 E010611 · E010612, 2026-10-22 실측).
-- 수수료는 취득원가에 들어가지 않고 지급수수료(판)로 간다(증가: 대변 출금계좌 합계에 더함 · 감소: 입금계좌 금액에서 뺌).
ALTER TABLE fixed_asset_movements ADD COLUMN fee numeric(18, 2);
UPDATE fixed_asset_movements SET fee = 0 WHERE fee IS NULL;
ALTER TABLE fixed_asset_movements ALTER COLUMN fee SET NOT NULL;
ALTER TABLE fixed_asset_movements ADD COLUMN gain_loss_account_id bigint CONSTRAINT fk_fixed_asset_movements_gain_loss_account_id REFERENCES accounts (id);
ALTER TABLE fixed_asset_movements ADD COLUMN partner_id bigint CONSTRAINT fk_fixed_asset_movements_partner_id REFERENCES business_partners (id);
CREATE INDEX idx_fixed_asset_movements_gain_loss_account_id ON fixed_asset_movements (gain_loss_account_id);
CREATE INDEX idx_fixed_asset_movements_partner_id ON fixed_asset_movements (partner_id);

-- 자산을 등록할 때 넣는 첫 증가 전표의 수수료 · 거래처
ALTER TABLE fixed_assets ADD COLUMN acquisition_fee numeric(18, 2);
UPDATE fixed_assets SET acquisition_fee = 0 WHERE acquisition_fee IS NULL;
ALTER TABLE fixed_assets ALTER COLUMN acquisition_fee SET NOT NULL;
ALTER TABLE fixed_assets ADD COLUMN partner_id bigint CONSTRAINT fk_fixed_assets_partner_id REFERENCES business_partners (id);
CREATE INDEX idx_fixed_assets_partner_id ON fixed_assets (partner_id);
