package com.erp.groupware.schedule;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ScheduleCategoryRepository extends JpaRepository<ScheduleCategory, Long> {

    List<ScheduleCategory> findAllByOrderByCodeAsc();

    boolean existsByCode(String code);
}
