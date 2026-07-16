package com.erp.accounting.domain;

import com.erp.groupware.domain.enums.NoteStatus;
import com.erp.groupware.domain.enums.NoteType;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;
import com.erp.trade.domain.BusinessPartner;

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
}
