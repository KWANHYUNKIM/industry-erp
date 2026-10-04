package com.erp.accounting.otherwithholding;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface OtherWithholdingRepository extends JpaRepository<OtherWithholding, Long> {

    /** 지급일 from ~ to 의 소득자가 있는 줄 — 원천징수이행상황신고서 · 간이지급명세서. 원본은 소득자 없는 줄을 세지 않는다. */
    @Query("select w from OtherWithholding w left join fetch w.partner "
            + "where w.payDate between :from and :to and w.payeeName is not null "
            + "order by w.payDate desc, w.id desc")
    List<OtherWithholding> findBetween(@Param("from") LocalDate from, @Param("to") LocalDate to);

    /** 귀속연월 from ~ to(YYYY-MM, 양끝 포함)의 소득자가 있는 줄 — 소득자료제출집계표 · 원천세신고자료비교표. */
    @Query("select w from OtherWithholding w where w.attributionMonth between :from and :to and w.payeeName is not null "
            + "order by w.payDate, w.id")
    List<OtherWithholding> findByAttributionBetween(@Param("from") String from, @Param("to") String to);

    /** 지급일 from ~ to 의 모든 줄(소득자 없는 줄 포함) — 기타원천세조회 · 현황 · 전표 열기. */
    @Query("select w from OtherWithholding w left join fetch w.payee "
            + "where w.payDate between :from and :to order by w.payDate, w.slipSeq, w.lineNo")
    List<OtherWithholding> findLinesBetween(@Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("select w from OtherWithholding w left join fetch w.payee "
            + "where w.payDate = :payDate and w.slipSeq = :slipSeq order by w.lineNo")
    List<OtherWithholding> findSlip(@Param("payDate") LocalDate payDate, @Param("slipSeq") int slipSeq);

    @Query("select coalesce(max(w.slipSeq), 0) from OtherWithholding w where w.payDate = :payDate")
    int maxSlipSeq(@Param("payDate") LocalDate payDate);
}
