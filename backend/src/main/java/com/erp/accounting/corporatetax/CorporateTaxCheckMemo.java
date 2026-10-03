package com.erp.accounting.corporatetax;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/**
 * 법인세Checklist(E030401) 항목의 메모 한 건. 원본은 항목(1~15)마다 [메모등록] → 메모리스트 [날짜 · 제목 · 작성자],
 * 메모는 기준연도마다 따로다.
 */
@Entity
@Table(name = "corporate_tax_check_memos")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class CorporateTaxCheckMemo extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "base_year", nullable = false)
    private Integer baseYear;

    @Column(name = "section_no", nullable = false)
    private Integer sectionNo;

    @Column(name = "memo_date", nullable = false)
    private LocalDate memoDate;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "content", nullable = false, columnDefinition = "text")
    private String content;

    @Column(name = "writer", length = 100)
    private String writer;
}
