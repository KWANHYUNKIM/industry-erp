package com.erp.accounting.cost.expenseitem;

import com.erp.accounting.ledger.account.Account;
import com.erp.accounting.cost.expensecontrol.ExpenseControlType;
import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * 비용(원본 E060809 비용등록 — 비용 마스터, 2026-10-20 실측). 비용내역입력 줄의 [비용코드] 가 이것을 고르고,
 * 회계반영(가지급금정산서) 때 차변 계정이 이 비용의 [계정] 이다.
 *
 * <p>[사용인원] 은 사원 id 만 든다 — accounting 은 hr 을 새로 참조하지 않는다(CLAUDE.md 4.1, 작업지시서 담당자와 같은 이유).
 * 이름은 화면이 사원 목록에서 붙인다.
 */
@Entity
@Table(name = "expense_items")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ExpenseItem extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 20)
    private String code;

    @Column(nullable = false, length = 100)
    private String name;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id")
    private Account account;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "control_type_id")
    private ExpenseControlType controlType;

    /** [개인별한도금액](placeholder '총한도금액') — 통제유형을 골랐을 때만 칸이 생긴다. */
    @Column(name = "limit_amount", precision = 18, scale = 2)
    private BigDecimal limitAmount;

    /** [사용인원] — 사원 id 여럿 */
    @ElementCollection
    @CollectionTable(name = "expense_item_users", joinColumns = @JoinColumn(name = "expense_item_id"))
    @Column(name = "employee_id")
    @Builder.Default
    private Set<Long> employeeIds = new LinkedHashSet<>();

    /** [통제기간] — 통제유형 기간이 '지정기간' 일 때만(처음은 오늘 ~ 오늘, 원본 2026-10-22). */
    @Column(name = "control_from")
    private java.time.LocalDate controlFrom;

    @Column(name = "control_to")
    private java.time.LocalDate controlTo;

    /** [통제알림대상](대상자선택) — 사원 id 여럿 */
    @ElementCollection
    @CollectionTable(name = "expense_item_alert_targets", joinColumns = @JoinColumn(name = "expense_item_id"))
    @Column(name = "employee_id")
    @org.hibernate.annotations.BatchSize(size = 50)
    @Builder.Default
    private Set<Long> alertEmployeeIds = new LinkedHashSet<>();

    @Column(length = 500)
    private String remark;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
