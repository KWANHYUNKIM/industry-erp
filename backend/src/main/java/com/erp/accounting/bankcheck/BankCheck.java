package com.erp.accounting.bankcheck;

import com.erp.accounting.bankcard.BankAccount;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;
import com.erp.trade.partner.BusinessPartner;

/**
 * 수표. 받은수표는 보유하다가 계좌에 입금하거나 부도가 나고,
 * 발행수표는 당좌계좌에서 끊는 순간 예금이 빠지고(회계 반영) 나중에 은행 인출이 확인되면 결제완료로 표시한다.
 */
@Entity
@Table(name = "bank_checks")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class BankCheck extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 수표번호 (예: 가1234567) */
    @Column(nullable = false, unique = true, length = 30)
    private String checkNo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CheckType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CheckStatus status;

    /** 받은수표는 수취일, 발행수표는 발행일 */
    @Column(nullable = false)
    private LocalDate issueDate;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    /** 발행 은행(받은수표는 수표에 적힌 은행) */
    @Column(length = 50)
    private String bankName;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_id")
    private BusinessPartner partner;

    /** 발행수표는 끊어 준 당좌계좌, 받은수표는 입금한 계좌 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "bank_account_id")
    private BankAccount bankAccount;

    /** 받은수표를 입금하거나 발행수표가 인출된 날 */
    private LocalDate settledDate;

    /**
     * 손을 떠날 때(입금 · 부도) 만든 회계전표 id. 원본 수령수표감소현황의 [일자-No.] 가 이 전표다(V239).
     * 받을 때의 분개는 source_id 로 이미 잇는다. 발행수표 결제는 분개가 없어 비어 있다.
     */
    @Column(name = "settle_journal_id")
    private Long settleJournalId;

    @Column(length = 200)
    private String remark;

    /**
     * 감소 줄의 적요 — 원본 수령수표입금처리 · 발행수표출금처리 펼침 [수표만감소] 창의 적요 '증가적요동일 · 수표번호 · 직접입력'
     * (2026-10-21 loginaa 실측). 비면 증가 적요({@link #remark})를 그대로 보인다(증가적요동일). 수표내역입력 감소 줄의 적요도 여기.
     */
    @Column(name = "out_remark", length = 200)
    private String outRemark;

    /**
     * 원본 수령(발행)수표내역입력 줄의 [부서] — 수표거래내역 [부서명], 조회 · 현황 조건 [부서](2026-10-14 loginaa 실측 '개발팀').
     * hr 를 참조하지 않으려 id 만 든다(CLAUDE.md 4.1 — accounting → hr 는 부채 간선). 이름은 화면이 부서 목록에서 붙인다.
     */
    @Column(name = "department_id")
    private Long departmentId;

    /** 줄의 [프로젝트] — 수표거래내역 [프로젝트명] '20210801A Project'. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private com.erp.inventory.project.Project project;

    @Column(length = 50)
    private String createdBy;

    /** 원본 수령(발행)수표조회의 [최종수정자] — 입금 · 부도 · 결제와 그 취소를 한 사람. */
    @Column(length = 50)
    private String updatedBy;

    /**
     * 원본 수령(발행)수표내역입력에서 분개 없이 직접 넣은 수표(거래유형 '수표만증가' · '수표만감소').
     * 받을 때도 손을 떠날 때도 회계전표 · 계좌가 움직이지 않는다.
     */
    @Column(name = "direct_entry", nullable = false)
    @Builder.Default
    private boolean directEntry = false;

    /**
     * 수표내역입력 전표 번호(원본 [일자-No.] 의 No.) — 늘린 전표 · 줄인 전표. 분개로 움직인 수표는 비어 있다(그쪽은 회계전표 번호).
     * {@code check_entry_counters} 가 (수표 종류, 날짜) 마다 매기고 지운 번호는 다시 주지 않는다.
     */
    @Column(name = "direct_in_no")
    private Integer directInNo;

    @Column(name = "direct_out_no")
    private Integer directOutNo;

    /**
     * 채권감소등록 [입금보고서작성] 수금형태 '수표'(채무감소등록 [지출결의서작성] 지급형태 '수표')로 늘어난 수표 — 그 입금보고서(지출결의서).
     * 원본(2026-10-14 loginaa 실측) 수표조회 증가 줄의 거래유형 '입금보고서' · [회계전표일자-No.] 가 이 전표이고, 전표를 지우면
     * 수표도 사라진다(FK ON DELETE CASCADE, V402). 돈은 수표계좌(입금보고서의 돈 들어온 계좌)로 이미 들어가 있으므로
     * {@link #directEntry} 처럼 수표계좌 기준이다 — 입금처리의 대변 계정이 수표계좌의 계정(보통예금)이다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_voucher_id")
    private com.erp.accounting.fastvoucher.FastVoucher sourceVoucher;
}
