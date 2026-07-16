package com.erp.groupware.repository;

import com.erp.groupware.domain.ScheduleEvent;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ScheduleEventRepository extends JpaRepository<ScheduleEvent, Long> {
}
