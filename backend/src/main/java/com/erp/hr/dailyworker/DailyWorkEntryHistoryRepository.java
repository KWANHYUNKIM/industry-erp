package com.erp.hr.dailyworker;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public interface DailyWorkEntryHistoryRepository extends JpaRepository<DailyWorkEntryHistory, Long> {

    List<DailyWorkEntryHistory> findByActedAtBetweenOrderByActedAtDescIdDesc(LocalDateTime from, LocalDateTime to);

    List<DailyWorkEntryHistory> findBySlipDateAndSlipNoOrderByActedAtAscIdAsc(LocalDate slipDate, int slipNo);
}
