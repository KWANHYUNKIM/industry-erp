package com.erp.groupware.schedule;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ScheduleLabelRepository extends JpaRepository<ScheduleLabel, Long> {

    List<ScheduleLabel> findAllByOrderByCodeAsc();

    boolean existsByCode(String code);
}
