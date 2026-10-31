package com.erp.accounting.ledger.bond;

import com.erp.accounting.ledger.account.Account;
import com.erp.inventory.project.Project;
import com.erp.trade.partner.BusinessPartner;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 채권(채무)내역 한 줄. 같은 [채권번호]를 단 줄끼리 한 채권이다 — 증가 줄이 생기게 하고 감소 줄이 줄인다.
 * 부서는 hr 모듈이라(accounting → hr 은 걷어낼 간선) id 만 든다. 이름은 화면이 부서 목록에서 붙인다.
 */
@Entity
@Table(name = "bond_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class BondLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "entry_id", nullable = false)
    private BondEntry entry;

    @Column(name = "line_no", nullable = false)
    private Integer lineNo;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "account_id", nullable = false)
    private Account account;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_id")
    private BusinessPartner partner;

    @Column(name = "bond_no", nullable = false, length = 30)
    private String bondNo;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    /** 원본 [채권 만기일자] — 증가 줄에만 있다(감소 창에는 칸이 없다). */
    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "department_id")
    private Long departmentId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private Project project;

    @Column(length = 300)
    private String memo;
}
