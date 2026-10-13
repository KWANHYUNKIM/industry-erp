package com.erp.accounting.contractbill;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 회계 II › 계약관리 › 청구예정자료 › <b>청구예정자료생성</b>(E060905) 한 장 — 2026-10-13 loginaa 실측.
 *
 * <p>[청구생성번호] 는 일자-No.('2026/10/13 -1'). 목록 열: 청구생성번호 · 청구단위 · 항목 · 계약명 · 거래처 · 금액 · 회계반영여부 · 판매생성여부.
 * 회계반영은 줄마다 든다({@link ContractBillLine#getJournalEntryId()}) — 회계/판매일괄반영(E060906)이 거래처별로 매출전표 I 를 만든다.
 * 이 장의 [회계반영여부] 는 줄이 모두 반영됐을 때다. (accounting_reflected 컬럼은 V354 부터 쓰지 않는다.)
 * 판매생성은 아직 우리에게 없다.
 */
@Entity
@Table(name = "contract_bills")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ContractBill extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "bill_date", nullable = false)
    private LocalDate billDate;

    @Column(name = "doc_no", nullable = false)
    private Integer docNo;

    @Column(name = "vat_type", nullable = false, length = 30)
    private String vatType;

    @Column(name = "sales_created", nullable = false)
    private boolean salesCreated;

    @Column(name = "created_by", length = 50)
    private String createdBy;

    @OneToMany(mappedBy = "bill", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("lineNo")
    @Builder.Default
    private List<ContractBillLine> lines = new ArrayList<>();
}
