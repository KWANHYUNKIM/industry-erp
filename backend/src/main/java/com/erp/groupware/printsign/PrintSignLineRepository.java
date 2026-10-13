package com.erp.groupware.printsign;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface PrintSignLineRepository extends JpaRepository<PrintSignLine, Long> {

    @Query("select distinct l from PrintSignLine l left join fetch l.slots where l.module = :module order by l.lineNo")
    List<PrintSignLine> findByModuleWithSlots(PrintSignModule module);

    Optional<PrintSignLine> findByModuleAndLineNo(PrintSignModule module, Integer lineNo);
}
