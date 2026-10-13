package com.erp.trade.price;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface SpecialPriceGroupWarehouseRepository extends JpaRepository<SpecialPriceGroupWarehouse, Long> {

    @Query("select w from SpecialPriceGroupWarehouse w join fetch w.warehouse join fetch w.group " +
            "order by w.tradeType desc, w.warehouse.code asc")
    List<SpecialPriceGroupWarehouse> findAllWithRefs();

    @Query("select w from SpecialPriceGroupWarehouse w join fetch w.group " +
            "where w.warehouse.id = :warehouseId and w.tradeType = :type")
    Optional<SpecialPriceGroupWarehouse> findByWarehouse(@Param("warehouseId") Long warehouseId,
                                                         @Param("type") SpecialPriceType type);

    boolean existsByGroupId(Long groupId);

    /** 특별단가그룹을 지울 때 그 그룹 줄도 함께 — 원본 확인 글 '…설정도 모두 삭제됩니다.' */
    void deleteByGroupId(Long groupId);
}
