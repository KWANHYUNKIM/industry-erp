package com.erp.settings.repository;

import com.erp.settings.domain.PriceOrderSetting;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PriceOrderSettingRepository extends JpaRepository<PriceOrderSetting, Long> {

    List<PriceOrderSetting> findByCategoryOrderByApplyOrderAsc(String category);

    void deleteByCategory(String category);
}
