package com.erp.hr.attendancekind;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface VacationGrantRepository extends JpaRepository<VacationGrant, Long> {

    @Query("select g from VacationGrant g join fetch g.employee e left join fetch e.department where g.vacationKind.id = :kindId order by e.code")
    List<VacationGrant> findByKind(Long kindId);

    /** [vacationKindId, 등록인원수] */
    @Query("select g.vacationKind.id, count(g) from VacationGrant g group by g.vacationKind.id")
    List<Object[]> countByKind();

    @Modifying
    @Query("delete from VacationGrant g where g.vacationKind.id = :kindId")
    void deleteByKind(Long kindId);

    boolean existsByVacationKind_Id(Long kindId);
}
