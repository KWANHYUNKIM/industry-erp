package com.erp.hr.workrecord;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface WorkRecordHistoryRepository extends JpaRepository<WorkRecordHistory, Long> {

    List<WorkRecordHistory> findByActedAtBetweenOrderByActedAtDescIdDesc(LocalDateTime from, LocalDateTime to);

    List<WorkRecordHistory> findBySlipDateAndSlipNoOrderByActedAtAscIdAsc(java.time.LocalDate slipDate, int slipNo);
}
