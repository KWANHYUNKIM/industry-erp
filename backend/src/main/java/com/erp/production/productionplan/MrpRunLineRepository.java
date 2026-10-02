package com.erp.production.productionplan;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface MrpRunLineRepository extends JpaRepository<MrpRunLine, Long> {

    @Query("select l from MrpRunLine l join fetch l.item where l.run.id = :runId and l.kind = :kind order by l.lineNo")
    List<MrpRunLine> findByRun(Long runId, MrpRunKind kind);

    @Modifying
    @Query("delete from MrpRunLine l where l.run.id = :runId and l.kind = :kind")
    void deleteByRun(Long runId, MrpRunKind kind);

    @Query("select l.run.id, l.kind, count(l), sum(l.planQty) from MrpRunLine l group by l.run.id, l.kind")
    List<Object[]> summary();
}
