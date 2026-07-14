package com.erp.repository;

import com.erp.domain.PrintSignLine;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface PrintSignLineRepository extends JpaRepository<PrintSignLine, Long> {

    @Query("select distinct l from PrintSignLine l left join fetch l.slots order by l.id")
    List<PrintSignLine> findAllWithSlots();

    @Query("select distinct l from PrintSignLine l left join fetch l.slots " +
            "where l.defaultLine = true and l.active = true")
    Optional<PrintSignLine> findDefault();

    boolean existsByName(String name);

    List<PrintSignLine> findByDefaultLineTrue();
}
