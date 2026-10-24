package com.erp.hr.attendancekind;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AttendanceKindGroupRepository extends JpaRepository<AttendanceKindGroup, Long> {

    List<AttendanceKindGroup> findAllByOrderByCodeAsc();

    boolean existsByCode(String code);
}
