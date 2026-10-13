package com.erp.hr.workrecord;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 근무조회 [이력](원본 E090105 '근무조회 이력조회') 한 줄 — 근무 전표를 만들고(신규) 고치고(수정) 지울(삭제) 때마다 남긴다.
 * 전표가 지워져도 남아야 해서 work_records 를 가리키지 않고 그때의 사원 · 수당항목 · 근무기록을 글로 적어 둔다.
 */
@Entity
@Table(name = "work_record_histories")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class WorkRecordHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "slip_date", nullable = false)
    private LocalDate slipDate;

    @Column(name = "slip_no", nullable = false)
    private int slipNo;

    /** 신규 · 수정 · 삭제. */
    @Column(nullable = false, length = 10)
    private String action;

    /** 근무조회와 같은 꼴 — '변종호' · '정재원 외 1건'. */
    @Column(name = "employee_name", nullable = false, length = 200)
    private String employeeName;

    @Column(name = "pay_item_name", nullable = false, length = 100)
    private String payItemName;

    /** 전표 줄들의 근무기록 합. */
    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal quantity;

    /** 작업자 — 로그인 아이디. */
    @Column(nullable = false, length = 100)
    private String worker;

    @Column(name = "acted_at", nullable = false)
    private LocalDateTime actedAt;

    /** 그때의 줄(근무일자 · 사원 · 부서 · 수당항목 · 단위 · 근무기록) JSON — 이력의 [전표번호] 창 · 근무일자/부서 조건. */
    @Column(name = "lines_json", columnDefinition = "text")
    private String linesJson;
}
