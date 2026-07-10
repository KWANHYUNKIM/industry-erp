package com.erp.repository;

import com.erp.domain.StockTransfer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface StockTransferRepository extends JpaRepository<StockTransfer, Long> {

    @Query("select t from StockTransfer t " +
            "join fetch t.item join fetch t.fromWarehouse join fetch t.toWarehouse " +
            "order by t.transferDate desc, t.id desc")
    List<StockTransfer> findAllWithRefs();
}
