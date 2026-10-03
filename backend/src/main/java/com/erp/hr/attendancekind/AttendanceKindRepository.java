package com.erp.hr.attendancekind;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AttendanceKindRepository extends JpaRepository<AttendanceKind, Long> {

    List<AttendanceKind> findAllByOrderByCodeAsc();

    boolean existsByCode(String code);

    boolean existsByName(String name);

    boolean existsByNameAndIdNot(String name, Long id);
}
