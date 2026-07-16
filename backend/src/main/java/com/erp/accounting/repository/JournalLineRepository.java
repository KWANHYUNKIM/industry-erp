package com.erp.accounting.repository;

import com.erp.accounting.domain.JournalLine;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface JournalLineRepository extends JpaRepository<JournalLine, Long> {

    /** 계정별원장: 특정 계정의 기간 내 분개 라인(전표·거래처 포함) */
    @Query("select l from JournalLine l " +
            "join fetch l.entry e left join fetch e.partner " +
            "join fetch l.account " +
            "where l.account.id = :accountId and e.entryDate between :from and :to " +
            "order by e.entryDate asc, e.id asc, l.lineNo asc")
    List<JournalLine> findByAccountAndPeriod(@Param("accountId") Long accountId,
                                             @Param("from") LocalDate from,
                                             @Param("to") LocalDate to);

    /** 시산표/재무제표용: 계정별 차변합·대변합 집계 (기간 내) */
    @Query("select l.account.id, l.account.code, l.account.name, l.account.division, " +
            "coalesce(sum(l.debit),0), coalesce(sum(l.credit),0) " +
            "from JournalLine l join l.entry e " +
            "where e.entryDate between :from and :to " +
            "group by l.account.id, l.account.code, l.account.name, l.account.division " +
            "order by l.account.code")
    List<Object[]> sumByAccount(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
