package com.erp.inventory.repository;

import com.erp.inventory.domain.StockTransfer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.time.LocalDate;

public interface StockTransferRepository extends JpaRepository<StockTransfer, Long> {

    @Query("select t from StockTransfer t " +
            "join fetch t.item join fetch t.fromWarehouse join fetch t.toWarehouse " +
            "order by t.transferDate desc, t.id desc")
    List<StockTransfer> findAllWithRefs();

    /**
     * 기간으로 걸러 온다. 안 준 쪽은 서비스가 열린 끝으로 채워 준다 —
     * <code>:from is null</code> 로 쓰면 PostgreSQL 이 그 자리의 형을 못 정해 터진다.
     */
    @Query("select t from StockTransfer t " +
            "join fetch t.item join fetch t.fromWarehouse join fetch t.toWarehouse " +
            "where t.transferDate between :from and :to " +
            "order by t.transferDate desc, t.id desc")
    List<StockTransfer> findWithRefsByPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
