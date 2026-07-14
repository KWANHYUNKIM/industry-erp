package com.erp.domain;

import com.erp.domain.enums.BusinessContractStatus;
import com.erp.domain.enums.BusinessContractType;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 거래처 계약. 작성 → 서명요청 → 전자서명 → (해지).
 * 전자서명은 서명자·서명일시·동의문구를 남기는 방식이다(외부 공인인증기관 연동은 없다).
 */
@Entity
@Table(name = "business_contracts")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class BusinessContract extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 계약번호 (예: CT-20260714-0001) */
    @Column(nullable = false, unique = true, length = 30)
    private String contractNo;

    @Column(nullable = false, length = 200)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BusinessContractType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BusinessContractStatus status;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "partner_id", nullable = false)
    private BusinessPartner partner;

    @Column(nullable = false)
    private LocalDate startDate;

    @Column(nullable = false)
    private LocalDate endDate;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    /** 결제조건 (예: 월말 마감 익월 10일 지급) */
    @Column(length = 200)
    private String paymentTerms;

    @Column(columnDefinition = "text")
    private String content;

    /** 상대에게 서명을 요청한 시각 */
    private LocalDateTime sentAt;

    // ── 전자서명 기록 ──────────────────────────────────────────────────
    @Column(length = 50)
    private String signerName;

    private LocalDateTime signedAt;

    /** 서명 시점에 동의한 문구를 그대로 보관한다 */
    @Column(length = 300)
    private String agreement;

    /** 해지일·해지사유 */
    private LocalDate terminatedDate;

    @Column(length = 200)
    private String terminationReason;

    @Column(length = 50)
    private String createdBy;
}
