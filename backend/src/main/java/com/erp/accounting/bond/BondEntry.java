package com.erp.accounting.bond;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 회계 II &gt; 채권관리 · 채무관리의 <b>채권(채무)내역</b> 한 장 — 원본 E060403 채권조회 [신규(F2)] 창(2026-10-12 loginaa 실측).
 *
 * <p>머리는 전표일자 · 증감구분, 줄은 계정 · 거래처 · 채권번호 · 금액 · 만기일자 · 부서 · 프로젝트 · 적요.
 * 원본 [일자-No.] 의 No. 는 같은 날 몇 번째 장인지다({@link #entryNo}). 수정 창에서 전표일자 · 증감구분은 못 바꾼다.
 * 회계전표와 따로 도는 보조장부라 저장해도 분개가 생기지 않는다(원본 [회계일자-No.] 빈칸).
 */
@Entity
@Table(name = "bond_entries")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class BondEntry extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12)
    private BondSide side;

    @Column(name = "entry_date", nullable = false)
    private LocalDate entryDate;

    @Column(name = "entry_no", nullable = false)
    private Integer entryNo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private BondDirection direction;

    @Column(name = "created_by", length = 50)
    private String createdBy;

    @Column(name = "updated_by", length = 50)
    private String updatedBy;

    @OneToMany(mappedBy = "entry", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("lineNo asc")
    @Builder.Default
    private List<BondLine> lines = new ArrayList<>();

    public void replaceLines(List<BondLine> next) {
        lines.clear();
        int no = 1;
        for (BondLine l : next) {
            l.setEntry(this);
            l.setLineNo(no++);
            lines.add(l);
        }
    }
}
