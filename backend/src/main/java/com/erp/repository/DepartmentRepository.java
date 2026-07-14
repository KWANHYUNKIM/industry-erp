package com.erp.repository;

import com.erp.domain.Department;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface DepartmentRepository extends JpaRepository<Department, Long> {

    boolean existsByCode(String code);

    boolean existsByParentId(Long parentId);

    /** 목록에서 상위 부서명을 함께 쓰므로 fetch join 으로 가져온다 (N+1 방지). */
    @Query("select d from Department d left join fetch d.parent order by d.sortOrder asc, d.name asc")
    List<Department> findAllWithParent();
}
