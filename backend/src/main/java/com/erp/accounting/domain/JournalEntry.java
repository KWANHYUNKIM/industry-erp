package com.erp.accounting.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import com.erp.common.BaseTimeEntity;
import com.erp.trade.domain.BusinessPartner;

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

    @OneToMany(mappedBy = "entry", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("lineNo asc")
    @Builder.Default
    private List<JournalLine> lines = new ArrayList<>();

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
