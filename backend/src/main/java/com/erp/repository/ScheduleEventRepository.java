package com.erp.repository;

import com.erp.domain.ScheduleEvent;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ScheduleEventRepository extends JpaRepository<ScheduleEvent, Long> {
}
