package com.erp.accounting.promissorynote;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;
import com.erp.trade.partner.BusinessPartner;

/**
 * 어음. 받을어음(매출대금을 어음으로 수취) / 지급어음(매입대금을 어음으로 발행).
 *
 * 수취·발행 시점에 채권/채무가 어음으로 대체되고(분개), 만기에 결제되면 예금으로 정리된다.
 * 받을어음은 만기 전에 은행에 할인(매각)하거나 부도가 날 수 있다.
 */
@Entity
@Table(name = "promissory_notes")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PromissoryNote extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 어음번호 (예: BN-20260714-0001) */
    @Column(name = "note_no", nullable = false, unique = true, length = 30)
    private String noteNo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private NoteType type;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "partner_id", nullable = false)
    private BusinessPartner partner;

    /** 발행일(지급어음) 또는 수취일(받을어음) */
    @Column(name = "issue_date", nullable = false)
    private LocalDate issueDate;

    @Column(name = "due_date", nullable = false)
    private LocalDate dueDate;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private NoteStatus status = NoteStatus.HELD;

    /** 결제·할인·부도 처리일 */
    @Column(name = "closed_date")
    private LocalDate closedDate;

    /** 할인 시 은행에 떼인 할인료(매출채권처분손실) */
    @Column(name = "discount_fee", precision = 18, scale = 2)
    private BigDecimal discountFee;

    /** 발행 은행 (참고용 문자열. 은행 마스터는 두지 않는다) */
    @Column(name = "bank_name", length = 100)
    private String bankName;

    @Column(length = 300)
    private String remark;

    @Column(name = "created_by", length = 50)
    private String createdBy;

    /**
     * 원본 [내역만등록] — 회계전표 없이 내역만 적은 어음(받을어음조회 거래유형 '어음만증가', 회계전표일자-No. 빈칸).
     * 2026-10-13 loginaa 실측. 분개가 없으니 지울 때도 분개를 찾지 않는다.
     */
    @Column(name = "record_only", nullable = false)
    @Builder.Default
    private boolean recordOnly = false;

    /** 원본 받을어음증가 · [내역만등록] 의 [부서] — hr 를 참조하지 않으려 id 만 든다(2026-10-13 실측). */
    @Column(name = "department_id")
    private Long departmentId;

    /** 원본 받을어음증가 · [내역만등록] 의 [프로젝트]. */
    @Column(name = "project_id")
    private Long projectId;

    /**
     * [내역만등록] 감소 줄의 자기 적요 · 부서 · 프로젝트 — 원본 감소 격자는 어음번호 · 금액 · 부서 · 프로젝트 · 적요를 따로 받고
     * 받을어음조회 감소 줄이 그 값을 찍는다(2026-10-13 loginaa 실측). 증가 쪽 값(remark · departmentId · projectId)과 따로 든다.
     */
    @Column(name = "close_remark", length = 300)
    private String closeRemark;

    @Column(name = "close_department_id")
    private Long closeDepartmentId;

    @Column(name = "close_project_id")
    private Long closeProjectId;

    /**
     * 받을어음감소(E010602)가 만든 한 장 전표 — 차) 입금계좌 금액 · 이자비용 수수료 / 대) 받을어음 총금액(2026-10-20 loginaa 실측).
     * 감소를 지우면 이 전표를 지우고 계좌 입금을 되돌린다. 예전 [만기결제] · [할인]으로 닫힌 어음은 비어 있다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "close_journal_entry_id")
    private com.erp.accounting.journal.JournalEntry closeJournalEntry;
}
