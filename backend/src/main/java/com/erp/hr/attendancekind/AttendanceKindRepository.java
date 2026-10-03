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

    /** 근태그룹 이름으로 — 그룹 이름을 바꾸거나 지울 때 쓰는 근태항목을 찾는다. */
    List<AttendanceKind> findByKindGroup(String kindGroup);
}
