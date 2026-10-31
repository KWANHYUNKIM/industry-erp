package com.erp.accounting.tax.vatreturn;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * 부가세신고서 한 장의 <b>언제 누가 무엇을 만들고 지웠는지</b> — 원본 목록 [이력] 의 '부가세신고서 이력보기' 창
 * (순번 · 작업자ID · 작업일시 · 신고서종류 · 행위, 2026-10-20 loginaa 실측).
 * docCode 는 vat_return_docs 와 같은 글자이고, INFO 는 신고서 정보([신규(F2)] · 신고기간 눌러 고치기)다.
 * 한 번 남긴 줄은 고치지 않는다.
 */
@Entity
@Table(name = "vat_return_histories")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class VatReturnHistory {

    public static final String INFO = "INFO";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "vat_return_id", nullable = false)
    private VatReturn vatReturn;

    @Column(name = "changed_at", nullable = false)
    private LocalDateTime changedAt;

    @Column(name = "changed_by", length = 50)
    private String changedBy;

    @Column(name = "doc_code", nullable = false, length = 30)
    private String docCode;

    /** 행위 — 신규 · 수정 · 삭제 */
    @Column(nullable = false, length = 10)
    private String action;
}
