package com.erp.accounting.repository;

import com.erp.accounting.domain.Expense;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public interface ExpenseRepository extends JpaRepository<Expense, Long> {

    @Query("select e from Expense e join fetch e.account order by e.expenseDate desc, e.id desc")
    List<Expense> findAllWithAccount();

    /** 수입비용현황: 기간 내 지출 (계정 포함) */
    @Query("select e from Expense e join fetch e.account " +
            "where e.expenseDate between :from and :to " +
            "order by e.expenseDate desc, e.id desc")
    List<Expense> findByPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);

    /** 기간 내 프로젝트별 비용 합계 (N+1 을 피해 DB 에서 집계) */
    @Query("select e.project.id as projectId, coalesce(sum(e.amount), 0) as amount, count(e) as count " +
            "from Expense e where e.expenseDate between :from and :to and e.project is not null " +
            "group by e.project.id")
    List<ProjectAmount> sumByProject(@Param("from") LocalDate from, @Param("to") LocalDate to);

    /** 프로젝트가 지정되지 않은 비용의 합계 (미지정) */
    @Query("select coalesce(sum(e.amount), 0) from Expense e " +
            "where e.expenseDate between :from and :to and e.project is null")
    BigDecimal sumWithoutProject(@Param("from") LocalDate from, @Param("to") LocalDate to);

    interface ProjectAmount {
        Long getProjectId();
        BigDecimal getAmount();
        long getCount();
    }
}
