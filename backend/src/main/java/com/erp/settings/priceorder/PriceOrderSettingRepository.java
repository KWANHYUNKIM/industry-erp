package com.erp.settings.priceorder;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PriceOrderSettingRepository extends JpaRepository<PriceOrderSetting, Long> {

    List<PriceOrderSetting> findByCategoryOrderByApplyOrderAsc(String category);

    void deleteByCategory(String category);
}
