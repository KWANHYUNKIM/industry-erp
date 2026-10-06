package com.erp.quality.asrepair;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AsRepairSaleRepository extends JpaRepository<AsRepairSale, Long> {
    List<AsRepairSale> findByRepairId(Long repairId);
    List<AsRepairSale> findByRepairIdIn(List<Long> repairIds);
    long countByRepairId(Long repairId);
    java.util.Optional<AsRepairSale> findBySalesId(Long salesId);
}
