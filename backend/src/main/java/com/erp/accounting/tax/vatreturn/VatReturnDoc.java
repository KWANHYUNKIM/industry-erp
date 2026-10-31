package com.erp.accounting.tax.vatreturn;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * [신고서등] 창의 신고서 · 첨부서류 한 장 — 원본은 조회한 숫자를 저장해 두고 [새로불러오기] 전까지 그대로 보여 준다
 * (2026-10-13 loginaa: 카드매출을 넣고 신고서 조회 [취소] → (3) 0 그대로, [확인] 하면 다시 센다).
 * 숫자는 화면이 회계전표에서 세어 JSON 그대로 맡긴다(data). writtenAt 은 마지막으로 만든 때.
 */
@Entity
@Table(name = "vat_return_docs")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class VatReturnDoc extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "vat_return_id")
    private VatReturn vatReturn;

    /** RETURN(부가가치세신고서) · SALES_INVOICE · PURCHASE_INVOICE · CARD_SALES(6) · CARD_RECEIPT(15). */
    @Column(name = "doc_code", nullable = false, length = 30)
    private String docCode;

    @Column(name = "data", nullable = false, columnDefinition = "text")
    private String data;

    @Column(name = "written_at", nullable = false)
    private LocalDateTime writtenAt;
}
