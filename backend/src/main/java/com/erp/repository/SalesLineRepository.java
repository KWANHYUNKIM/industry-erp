package com.erp.repository;

import com.erp.domain.SalesLine;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.math.BigDecimal;
import java.util.List;

public interface SalesLineRepository extends JpaRepository<SalesLine, Long> {

    /** 품목별 판매수량·매출액(공급가) 집계 */
    @Query("select l.item.id as itemId, coalesce(sum(l.quantity),0) as qty, " +
            "coalesce(sum(l.supplyAmount),0) as amount " +
            "from SalesLine l group by l.item.id")
    List<ItemAggregate> aggregateByItem();

    interface ItemAggregate {
        Long getItemId();
        BigDecimal getQty();
        BigDecimal getAmount();
    }
}
