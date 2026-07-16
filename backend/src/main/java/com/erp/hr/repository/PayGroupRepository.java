package com.erp.hr.repository;

import com.erp.hr.domain.PayGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface PayGroupRepository extends JpaRepository<PayGroup, Long> {

    boolean existsByName(String name);

    @Query("select distinct g from PayGroup g " +
           "left join fetch g.lines l left join fetch l.payItem " +
           "order by g.name")
    List<PayGroup> findAllWithLines();
}
