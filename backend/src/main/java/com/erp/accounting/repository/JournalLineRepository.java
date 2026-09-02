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

    /**
     * 거래처별 <b>통제계정</b>(외상매출금·외상매입금) 차변합·대변합.
     *
     * <p>판매·구매전표에서 자동으로 만들어진 전표({@code excludeSource})는 뺀다 —
     * 그건 이미 전표 자체로 세고 있어서 두 번 세게 된다.
     *
     * <p>누적 잔액을 낼 때는 {@code from} 에 아주 이른 날짜를 준다. null 을 넘겨
     * 조건을 끄는 방식은 PostgreSQL 이 파라미터 타입을 못 정해 42P18 로 터진다.
     */
    @Query("select e.partner.id, coalesce(sum(l.debit),0), coalesce(sum(l.credit),0) " +
            "from JournalLine l join l.entry e " +
            "where l.account.code = :accountCode and e.partner is not null " +
            "and e.sourceType <> :excludeSource " +
            "and e.entryDate between :from and :to " +
            "group by e.partner.id")
    List<Object[]> sumControlAccountByPartner(@Param("accountCode") String accountCode,
                                              @Param("excludeSource") com.erp.accounting.domain.JournalSourceType excludeSource,
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
