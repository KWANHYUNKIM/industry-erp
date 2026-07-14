package com.erp.repository;

import com.erp.domain.EmploymentContract;
import com.erp.domain.enums.ContractStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface EmploymentContractRepository extends JpaRepository<EmploymentContract, Long> {

    @Query("select c from EmploymentContract c join fetch c.employee left join fetch c.department "
            + "order by c.startDate desc, c.id desc")
    List<EmploymentContract> findAllWithRefs();

    /**
     * 같은 사원의 서명된 계약 중, 시작일 이후까지 살아 있는 것.
     * 기간의 정함이 없는(종료일 null) 새 계약은 시작일 이후 전 구간을 덮으므로 이것만으로 판정한다.
     *
     * ("(:endDate is null or ...)" 로 한 쿼리에 합치면 PostgreSQL 이 바인딩 파라미터의 타입을
     *  추론하지 못해 터진다. 쿼리를 나누는 편이 확실하다.)
     */
    @Query("select c from EmploymentContract c "
            + "where c.employee.id = :employeeId and c.status = :status and c.id <> :selfId "
            + "and (c.endDate is null or c.endDate >= :startDate)")
    List<EmploymentContract> findActiveFrom(@Param("employeeId") Long employeeId,
                                            @Param("status") ContractStatus status,
                                            @Param("selfId") Long selfId,
                                            @Param("startDate") LocalDate startDate);

    /** 종료일이 있는 새 계약과 기간이 겹치는 서명 계약 */
    @Query("select c from EmploymentContract c "
            + "where c.employee.id = :employeeId and c.status = :status and c.id <> :selfId "
            + "and (c.endDate is null or c.endDate >= :startDate) "
            + "and c.startDate <= :endDate")
    List<EmploymentContract> findOverlapping(@Param("employeeId") Long employeeId,
                                             @Param("status") ContractStatus status,
                                             @Param("selfId") Long selfId,
                                             @Param("startDate") LocalDate startDate,
                                             @Param("endDate") LocalDate endDate);
}
