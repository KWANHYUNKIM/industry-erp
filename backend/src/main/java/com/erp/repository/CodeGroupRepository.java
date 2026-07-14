package com.erp.repository;

import com.erp.domain.CodeGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface CodeGroupRepository extends JpaRepository<CodeGroup, Long> {

    boolean existsByGroupCode(String groupCode);

    Optional<CodeGroup> findByGroupCode(String groupCode);

    /** 목록에서 코드까지 함께 쓰므로 fetch join 한다 (N+1 방지). */
    @Query("select distinct g from CodeGroup g left join fetch g.codes order by g.groupCode asc")
    List<CodeGroup> findAllWithCodes();
}
