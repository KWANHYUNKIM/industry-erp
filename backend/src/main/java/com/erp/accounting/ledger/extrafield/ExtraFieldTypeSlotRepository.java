package com.erp.accounting.ledger.extrafield;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ExtraFieldTypeSlotRepository extends JpaRepository<ExtraFieldTypeSlot, Long> {
    List<ExtraFieldTypeSlot> findByTypeIdOrderBySlotNo(Long typeId);
}
