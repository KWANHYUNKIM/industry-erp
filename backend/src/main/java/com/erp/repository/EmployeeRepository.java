package com.erp.repository;

import com.erp.domain.Employee;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface EmployeeRepository extends JpaRepository<Employee, Long> {

    boolean existsByCode(String code);

    Optional<Employee> findByCode(String code);

    /** work_results.worker 문자열을 사원으로 잇기 위한 조회. 동명이인이면 여러 건이 나온다. */
    List<Employee> findByName(String name);

    List<Employee> findByActiveTrueOrderByNameAsc();

    /** 목록에서 부서명을 함께 쓰므로 fetch join 으로 가져온다 (N+1 방지). */
    @Query("select e from Employee e left join fetch e.department where e.active = true order by e.name asc")
    List<Employee> findActiveWithDepartment();

    /** 퇴사자 포함 전 사원 (인사관리). 재직자를 먼저 보여준다. */
    @Query("select e from Employee e left join fetch e.department order by e.active desc, e.name asc")
    List<Employee> findAllWithDepartment();

    long countByDepartmentId(Long departmentId);

    List<Employee> findByDepartmentId(Long departmentId);
}
