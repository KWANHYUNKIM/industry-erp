package com.erp.hr.service;

import com.erp.hr.domain.Employee;
import com.erp.trade.domain.Purchase;
import com.erp.trade.domain.Sales;
import com.erp.hr.dto.EmployeePerformanceDtos.PerformanceRow;
import com.erp.hr.dto.EmployeePerformanceDtos.PerformanceSummary;
import com.erp.trade.repository.PurchaseRepository;
import com.erp.trade.repository.SalesRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.erp.hr.dto.EmployeePerformanceDtos;

/**
 * 담당자별 실적. 전표에 붙은 담당 사원(employee)으로 판매·구매를 집계한다.
 *
 * 입력 계정(createdBy)이 아니라 담당자로 센다 — 사무직원이 영업사원 대신 전표를 넣는 순간
 * 실적이 사무직원에게 붙으면 실적표는 아무 말도 하지 않는 표가 된다.
 *
 * 담당자가 없는 전표는 '미지정'으로 따로 보여준다. 아무에게나 나눠 붙이지 않는다.
 */
@Service
@RequiredArgsConstructor
public class EmployeePerformanceService {

    /** 담당자가 없는 전표를 모으는 가상 행 */
    private static final Long UNASSIGNED_ID = null;
    private static final String UNASSIGNED_NAME = "미지정";

    private final SalesRepository salesRepository;
    private final PurchaseRepository purchaseRepository;

    @Transactional(readOnly = true)
    public PerformanceSummary performance(LocalDate from, LocalDate to) {
        LocalDate f = from != null ? from : LocalDate.now().withDayOfMonth(1);
        LocalDate t = to != null ? to : LocalDate.now();

        Map<String, Row> rows = new LinkedHashMap<>();

        for (Sales s : salesRepository.findBySaleDateBetween(f, t)) {
            row(rows, s.getEmployee()).addSales(s.getTotalAmount());
        }
        for (Purchase p : purchaseRepository.findByPurchaseDateBetween(f, t)) {
            row(rows, p.getEmployee()).addPurchase(p.getTotalAmount());
        }

        BigDecimal totalSales = rows.values().stream().map(r -> r.sales).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalPurchase = rows.values().stream().map(r -> r.purchase).reduce(BigDecimal.ZERO, BigDecimal::add);

        List<PerformanceRow> list = new ArrayList<>();
        for (Row r : rows.values()) {
            list.add(new PerformanceRow(
                    r.employeeId, r.code, r.name, r.department,
                    r.salesCount, r.sales, r.purchaseCount, r.purchase,
                    share(r.sales, totalSales)));
        }
        // 매출이 큰 순. 미지정은 실적이 아니므로 항상 맨 아래로 내린다.
        list.sort((a, b) -> {
            if (a.employeeId() == null) return 1;
            if (b.employeeId() == null) return -1;
            return b.salesAmount().compareTo(a.salesAmount());
        });

        return new PerformanceSummary(f, t, totalSales, totalPurchase, list);
    }

    private Row row(Map<String, Row> rows, Employee e) {
        String key = e != null ? String.valueOf(e.getId()) : "-";
        return rows.computeIfAbsent(key, k -> e != null
                ? new Row(e.getId(), e.getCode(), e.getName(),
                          e.getDepartment() != null ? e.getDepartment().getName() : null)
                : new Row(UNASSIGNED_ID, "-", UNASSIGNED_NAME, null));
    }

    private BigDecimal share(BigDecimal amount, BigDecimal total) {
        if (total.signum() == 0) return BigDecimal.ZERO;
        return amount.multiply(new BigDecimal("100")).divide(total, 1, RoundingMode.HALF_UP);
    }

    /** 집계용 가변 누적기 */
    private static final class Row {
        private final Long employeeId;
        private final String code;
        private final String name;
        private final String department;
        private BigDecimal sales = BigDecimal.ZERO;
        private BigDecimal purchase = BigDecimal.ZERO;
        private int salesCount;
        private int purchaseCount;

        private Row(Long employeeId, String code, String name, String department) {
            this.employeeId = employeeId;
            this.code = code;
            this.name = name;
            this.department = department;
        }

        private void addSales(BigDecimal v) {
            sales = sales.add(v);
            salesCount++;
        }

        private void addPurchase(BigDecimal v) {
            purchase = purchase.add(v);
            purchaseCount++;
        }
    }
}
