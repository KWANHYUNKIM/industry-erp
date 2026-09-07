package com.erp.trade.repository;

import com.erp.trade.domain.TaxInvoice;
import com.erp.trade.domain.TaxInvoiceType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface TaxInvoiceRepository extends JpaRepository<TaxInvoice, Long> {

    boolean existsBySales_Id(Long salesId);

    /**
     * 준 전표들 중 <b>붙어 있는 것의 id</b>만 돌려준다.
     * 전표마다 {@code existsBySales_Id} 를 부르면 목록 화면에서 질의가 줄 수만큼 붙는다.
     */
    @Query("select distinct x.sales.id from TaxInvoice x where x.sales.id in :ids")
    List<Long> findSalesIdsIn(@Param("ids") List<Long> ids);

    boolean existsByPurchase_Id(Long purchaseId);

    /** 위와 같은 까닭 — 구매 쪽도 한 번에 받는다. */
    @Query("select distinct x.purchase.id from TaxInvoice x where x.purchase.id in :ids")
    List<Long> findPurchaseIdsIn(@Param("ids") List<Long> ids);

    @Query("select distinct t from TaxInvoice t join fetch t.partner " +
            "where t.invoiceType = :type and t.issueDate between :from and :to " +
            "order by t.issueDate desc, t.id desc")
    List<TaxInvoice> findByTypeAndPeriod(@Param("type") TaxInvoiceType type,
                                         @Param("from") LocalDate from,
                                         @Param("to") LocalDate to);
}
