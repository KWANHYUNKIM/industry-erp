package com.erp.accounting.journal;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import com.erp.common.BaseTimeEntity;
import com.erp.trade.partner.BusinessPartner;

/**
 * 회계전표(분개 헤더). 복식부기 전표 1건 = 이 헤더 + N개의 {@link JournalLine}.
 * 전표당 차변합 = 대변합(대차평형)은 저장 시 애플리케이션에서 강제한다.
 */
@Entity
@Table(name = "journal_entries")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class JournalEntry extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 전표번호 (예: GL-20260713-0001) */
    @Column(nullable = false, unique = true, length = 30)
    private String docNo;

    @Column(nullable = false)
    private LocalDate entryDate;

    @Column(length = 300)
    private String description;

    /** 거래처. 매출/매입 전표에서 자동 설정. 수동 전표는 선택. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_id")
    private BusinessPartner partner;

    /** 생성 출처. 업무전표(판매/구매/지출)에서 자동 생성됐는지 구분. */
    @Enumerated(EnumType.STRING)
    @Column(name = "source_type", nullable = false, length = 20)
    private JournalSourceType sourceType;

    /** 출처 업무전표의 id. MANUAL 이면 null. (source_type + source_id 유니크로 중복반영 방지) */
    @Column(name = "source_id")
    private Long sourceId;

    @Column(length = 50)
    private String createdBy;

    /** 진행상태 — 회계거래조회의 [확인] · [확인취소]. 원본은 저장하면 곧 확인이다(2026-10-13 실측, V334). */
    @Enumerated(EnumType.STRING)
    @Column(name = "confirm_status", nullable = false, length = 20)
    @Builder.Default
    private JournalConfirmStatus confirmStatus = JournalConfirmStatus.CONFIRMED;

    /**
     * 매출전표 I · 매입전표 I 의 [부가세유형](세금계산서 · 카드매출 · 현금영수증 …, V349). 그 밖의 전표는 비어 있다.
     * 지출증빙현황 · 전표vs매출매입자료비교가 이 값으로 증빙을 나눈다.
     */
    @Column(name = "vat_type", length = 30)
    private String vatType;

    /** [부가세유형 세금계산서] 아래 [전자종류](전자(세금)계산서-신규 · 종이(세금)계산서 · 기재사항착오정정 …, V353). */
    @Column(name = "e_invoice_kind", length = 30)
    private String eInvoiceKind;

    /** [예정누락분] — true 면 '예정누락'(예정신고 때 빠뜨려 확정신고에 넣는 것). 원본 기본 '예정누락아님'. */
    @Column(name = "vat_omitted", nullable = false)
    @Builder.Default
    private boolean vatOmitted = false;

    /** 매출전표 I [세부내역](세금계산서내역등록) 한 덩어리 — JSON 글자(V353). 서비스가 읽고 쓴다. */
    @Column(name = "vat_detail", columnDefinition = "text")
    private String vatDetail;

    /** 마지막으로 고친 사람 — 회계거래조회 조건 [최종수정자](V353). 만들 때는 만든 사람. */
    @Column(name = "updated_by", length = 50)
    private String updatedBy;

    /** 일반전표 머리의 [첨언내용](여러 줄) — 원본 E010201 입력 판. */
    @Column(name = "memo", length = 1000)
    private String memo;

    @OneToMany(mappedBy = "entry", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("lineNo asc")
    @Builder.Default
    private List<JournalLine> lines = new ArrayList<>();

    /**
     * 머리에서 고른 [부서] · [프로젝트]를 모든 줄에 붙인다 — 원본 영수증으로 [부서 개발팀] 전표는 차 · 대 두 줄 모두 개발팀이다
     * (2026-10-13 loginaa 26/10/13-5). 이미 줄에 따로 적힌 값은 두고, 비어 있는 줄만 채운다.
     */
    public void stampDeptProject(Long departmentId, Long projectId) {
        for (JournalLine l : lines) {
            if (l.getDepartmentId() == null) l.setDepartmentId(departmentId);
            if (l.getProjectId() == null) l.setProjectId(projectId);
        }
    }

    public void addLine(JournalLine line) {
        line.setEntry(this);
        line.setLineNo(this.lines.size() + 1);
        this.lines.add(line);
    }

    public BigDecimal totalDebit() {
        return lines.stream().map(JournalLine::getDebit).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    public BigDecimal totalCredit() {
        return lines.stream().map(JournalLine::getCredit).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** 대차평형 여부 */
    public boolean isBalanced() {
        return totalDebit().compareTo(totalCredit()) == 0;
    }
}
