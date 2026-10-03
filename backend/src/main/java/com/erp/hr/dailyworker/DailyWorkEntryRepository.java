package com.erp.hr.dailyworker;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDate;
import java.util.List;

public interface DailyWorkEntryRepository extends JpaRepository<DailyWorkEntry, Long> {

    @Query("select e from DailyWorkEntry e join fetch e.worker where e.slipDate between :from and :to "
            + "order by e.slipDate desc, e.slipNo desc, e.lineNo")
    List<DailyWorkEntry> findInPeriod(LocalDate from, LocalDate to);

    @Query("select e from DailyWorkEntry e join fetch e.worker where e.slipDate = :slipDate and e.slipNo = :slipNo order by e.lineNo")
    List<DailyWorkEntry> findSlip(LocalDate slipDate, int slipNo);

    @Query("select coalesce(max(e.slipNo), 0) from DailyWorkEntry e where e.slipDate = :slipDate")
    int maxSlipNo(LocalDate slipDate);

    @Modifying
    @Query("delete from DailyWorkEntry e where e.slipDate = :slipDate and e.slipNo = :slipNo")
    void deleteSlip(LocalDate slipDate, int slipNo);

    boolean existsByWorker_Id(Long workerId);
}
