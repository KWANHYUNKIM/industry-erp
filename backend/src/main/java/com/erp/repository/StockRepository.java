package com.erp.repository;

import com.erp.domain.Stock;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface StockRepository extends JpaRepository<Stock, Long> {

    /** 입출고 처리 시 잔량 행을 잠그고 조회 (동시성 안전) */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from Stock s where s.item.id = :itemId and s.warehouse.id = :warehouseId")
    Optional<Stock> findForUpdate(Long itemId, Long warehouseId);

    Optional<Stock> findByItemIdAndWarehouseId(Long itemId, Long warehouseId);

    /** 현재고 목록 (품목/창고 함께 로딩) */
    @Query("select s from Stock s join fetch s.item i join fetch s.warehouse w order by i.code, w.code")
    List<Stock> findAllWithItemAndWarehouse();
}
