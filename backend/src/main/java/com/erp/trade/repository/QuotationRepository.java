package com.erp.trade.repository;

import com.erp.trade.domain.Quotation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface QuotationRepository extends JpaRepository<Quotation, Long> {

    @Query("select distinct q from Quotation q join fetch q.partner " +
            "left join fetch q.lines l left join fetch l.item " +
            "order by q.quoteDate desc, q.id desc")
    List<Quotation> findAllWithRefs();

    /** 이 수주로 전환된 견적서. 수주를 지울 때 그 견적서의 전환을 풀어 준다. */
    Optional<Quotation> findByConvertedOrderId(Long convertedOrderId);
}
