package com.erp.trade.repository;

import com.erp.trade.domain.Quotation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface QuotationRepository extends JpaRepository<Quotation, Long> {

    @Query("select distinct q from Quotation q join fetch q.partner " +
            "left join fetch q.lines l left join fetch l.item " +
            "order by q.quoteDate desc, q.id desc")
    List<Quotation> findAllWithRefs();

    /**
     * 기간으로 걸러 온다. 안 준 쪽은 서비스가 열린 끝으로 채워 준다 —
     * <code>:from is null</code> 로 쓰면 PostgreSQL 이 그 자리의 형을 못 정해 터진다.
     */
    @Query("select distinct q from Quotation q join fetch q.partner " +
            "left join fetch q.lines l left join fetch l.item " +
            "where q.quoteDate between :from and :to " +
            "order by q.quoteDate desc, q.id desc")
    List<Quotation> findWithRefsByPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);

    /** 이 수주로 전환된 견적서. 수주를 지울 때 그 견적서의 전환을 풀어 준다. */
    Optional<Quotation> findByConvertedOrderId(Long convertedOrderId);
}
