package com.erp.accounting.balanceadjust;

import com.erp.accounting.journal.JournalEntry;
import com.erp.accounting.journal.JournalSourceType;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

/** 잔액조정 전표(BALANCE_ADJUST)만 보는 질의. 저장 · 삭제는 JournalEntryRepository 가 한다. */
public interface BalanceAdjustRepository extends Repository<JournalEntry, Long> {

    @Query("select distinct e from JournalEntry e " +
            "left join fetch e.lines l left join fetch l.account left join fetch l.partner " +
            "where e.sourceType = :type and e.entryDate between :from and :to " +
            "order by e.entryDate desc, e.id desc")
    List<JournalEntry> findAdjustments(@Param("type") JournalSourceType type,
                                       @Param("from") LocalDate from, @Param("to") LocalDate to);

    /** 한 계정의 기준일자까지 잔액을 부서 · 프로젝트 묶음으로 — exclude 전표(고치는 중인 잔액조정)는 뺀다. */
    @Query("select l.departmentId, l.projectId, coalesce(sum(l.debit),0), coalesce(sum(l.credit),0) " +
            "from JournalLine l join l.entry e " +
            "where l.account.id = :accountId and e.entryDate <= :asOf and e.id <> :exclude " +
            "group by l.departmentId, l.projectId")
    List<Object[]> sumByDeptProject(@Param("accountId") Long accountId, @Param("asOf") LocalDate asOf,
                                    @Param("exclude") long exclude);

    /** 거래처별 — 줄 거래처(없으면 전표 거래처) · 부서 · 프로젝트 묶음 잔액. 잔액실사(거래처별) 창이 쓴다. */
    @Query("select coalesce(lp.id, ep.id), l.departmentId, l.projectId, coalesce(sum(l.debit),0), coalesce(sum(l.credit),0) " +
            "from JournalLine l join l.entry e left join l.partner lp left join e.partner ep " +
            "where l.account.id = :accountId and e.entryDate <= :asOf and e.id <> :exclude " +
            "group by coalesce(lp.id, ep.id), l.departmentId, l.projectId")
    List<Object[]> sumByPartnerDeptProject(@Param("accountId") Long accountId, @Param("asOf") LocalDate asOf,
                                           @Param("exclude") long exclude);
}
