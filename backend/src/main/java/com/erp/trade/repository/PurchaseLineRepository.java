package com.erp.trade.repository;

import com.erp.trade.domain.PurchaseLine;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.math.BigDecimal;
import java.util.List;

public interface PurchaseLineRepository extends JpaRepository<PurchaseLine, Long> {

    /** 품목별 매입수량·매입액(공급가) 집계 → 총평균 매입단가 계산에 사용 */
    @Query("select l.item.id as itemId, coalesce(sum(l.quantity),0) as qty, " +
            "coalesce(sum(l.supplyAmount),0) as amount " +
            "from PurchaseLine l group by l.item.id")
    List<ItemAggregate> aggregateByItem();

    interface ItemAggregate {
        Long getItemId();
        BigDecimal getQty();
        BigDecimal getAmount();
    }
}
