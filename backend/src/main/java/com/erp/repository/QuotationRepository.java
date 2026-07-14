package com.erp.repository;

import com.erp.domain.Quotation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface QuotationRepository extends JpaRepository<Quotation, Long> {

    @Query("select distinct q from Quotation q join fetch q.partner " +
            "left join fetch q.lines l left join fetch l.item " +
            "order by q.quoteDate desc, q.id desc")
    List<Quotation> findAllWithRefs();
}
