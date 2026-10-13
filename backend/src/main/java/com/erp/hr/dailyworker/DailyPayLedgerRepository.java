package com.erp.hr.dailyworker;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface DailyPayLedgerRepository extends JpaRepository<DailyPayLedger, Long> {

    @Query("select l from DailyPayLedger l order by l.payMonth desc, l.seq desc")
    List<DailyPayLedger> findAllOrdered();

    @Query("select coalesce(max(l.seq), 0) from DailyPayLedger l where l.payMonth = :payMonth")
    int maxSeq(String payMonth);
}
