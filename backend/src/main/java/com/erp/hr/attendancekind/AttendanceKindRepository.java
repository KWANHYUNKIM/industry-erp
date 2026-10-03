package com.erp.hr.attendancekind;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AttendanceKindRepository extends JpaRepository<AttendanceKind, Long> {

    @org.springframework.data.jpa.repository.Query("select k from AttendanceKind k left join fetch k.vacationKind order by k.code")
    List<AttendanceKind> findAllByOrderByCodeAsc();

    boolean existsByVacationKind_Id(Long vacationKindId);

    boolean existsByCode(String code);

    boolean existsByName(String name);

    boolean existsByNameAndIdNot(String name, Long id);
}
