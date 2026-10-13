package com.erp.hr.payroll;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface PayItemFormulaRepository extends JpaRepository<PayItemFormula, Long> {

    @Query("select f from PayItemFormula f join fetch f.payItem order by f.payItem.sortOrder, f.payItem.id, f.effectiveFrom desc")
    List<PayItemFormula> findAllWithItem();

    @Query("select f from PayItemFormula f join fetch f.payItem where f.payItem.id = :itemId order by f.effectiveFrom desc")
    List<PayItemFormula> findByItem(Long itemId);

    Optional<PayItemFormula> findByPayItemIdAndEffectiveFrom(Long payItemId, String effectiveFrom);
}
