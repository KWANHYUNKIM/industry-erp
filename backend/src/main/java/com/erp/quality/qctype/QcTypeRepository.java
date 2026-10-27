package com.erp.quality.qctype;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface QcTypeRepository extends JpaRepository<QcType, Long> {

    boolean existsByCode(String code);

    List<QcType> findAllByOrderByCodeAsc();

    /** 그 품목이 붙은 유형 — 한 품목은 한 유형에만 붙는다(uk_quality_type_items_item). */
    @Query("select t from QcType t join t.itemIds i where i = :itemId")
    List<QcType> findByItemId(Long itemId);

    @Query("select count(t) > 0 from QcType t join t.checkSlots s where s.checkItemId = :checkItemId")
    boolean existsByCheckItemId(Long checkItemId);
}
