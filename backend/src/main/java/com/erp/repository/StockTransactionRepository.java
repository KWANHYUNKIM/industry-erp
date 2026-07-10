package com.erp.repository;

import com.erp.domain.StockTransaction;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface StockTransactionRepository extends JpaRepository<StockTransaction, Long> {

    /** 최근 입출고 이력 (품목/창고 함께 로딩, 최신순) */
    @Query(value = "select t from StockTransaction t " +
            "join fetch t.item join fetch t.warehouse " +
            "order by t.transactionDate desc, t.id desc",
            countQuery = "select count(t) from StockTransaction t")
    Page<StockTransaction> findAllWithRefs(Pageable pageable);
}
