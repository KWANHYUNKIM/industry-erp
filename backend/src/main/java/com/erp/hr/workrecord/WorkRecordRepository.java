package com.erp.hr.workrecord;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public interface WorkRecordRepository extends JpaRepository<WorkRecord, Long> {

    @Query("select w from WorkRecord w join fetch w.employee join fetch w.payItem " +
           "where w.slipDate between :from and :to order by w.slipDate desc, w.slipNo desc, w.lineNo")
    List<WorkRecord> findInPeriod(LocalDate from, LocalDate to);

    @Query("select w from WorkRecord w join fetch w.employee join fetch w.payItem " +
           "where w.slipDate = :slipDate and w.slipNo = :slipNo order by w.lineNo")
    List<WorkRecord> findSlip(LocalDate slipDate, int slipNo);

    @Query("select w from WorkRecord w join fetch w.employee join fetch w.payItem " +
           "where w.workDate between :from and :to order by w.employee.name, w.payItem.sortOrder")
    List<WorkRecord> findInWorkPeriod(LocalDate from, LocalDate to);

    @Query("select coalesce(max(w.slipNo), 0) from WorkRecord w where w.slipDate = :slipDate")
    int maxSlipNo(LocalDate slipDate);

    /** 급여계산: 사원 · 항목의 그 기간 근무기록 합. */
    @Query("select w.payItem.id, sum(w.quantity) from WorkRecord w " +
           "where w.employee.id = :employeeId and w.workDate between :from and :to group by w.payItem.id")
    List<Object[]> sumByItem(Long employeeId, LocalDate from, LocalDate to);

    void deleteBySlipDateAndSlipNo(LocalDate slipDate, int slipNo);
}
