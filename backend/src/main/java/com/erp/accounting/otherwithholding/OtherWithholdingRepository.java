package com.erp.accounting.otherwithholding;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface OtherWithholdingRepository extends JpaRepository<OtherWithholding, Long> {

    @Query("select w from OtherWithholding w left join fetch w.partner "
            + "where w.payDate between :from and :to "
            + "order by w.payDate desc, w.id desc")
    List<OtherWithholding> findBetween(@Param("from") LocalDate from, @Param("to") LocalDate to);

    /** 귀속연월 from ~ to(YYYY-MM, 양끝 포함) — 소득자료제출집계표 · 원천세신고자료비교표. */
    @Query("select w from OtherWithholding w where w.attributionMonth between :from and :to order by w.payDate, w.id")
    List<OtherWithholding> findByAttributionBetween(@Param("from") String from, @Param("to") String to);
}
