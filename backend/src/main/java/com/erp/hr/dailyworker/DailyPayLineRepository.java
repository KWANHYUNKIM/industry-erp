package com.erp.hr.dailyworker;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface DailyPayLineRepository extends JpaRepository<DailyPayLine, Long> {

    @Query("select l from DailyPayLine l join fetch l.worker where l.ledger.id = :ledgerId order by l.worker.code")
    List<DailyPayLine> findByLedger(Long ledgerId);

    @Modifying
    @Query("delete from DailyPayLine l where l.ledger.id = :ledgerId")
    void deleteByLedger(Long ledgerId);

    @Query("select l from DailyPayLine l join fetch l.ledger g join fetch l.worker w left join fetch w.department "
            + "where g.payMonth between :from and :to order by g.payMonth, g.seq, w.code")
    List<DailyPayLine> findInMonths(String from, String to);

    boolean existsByWorker_Id(Long workerId);
}
