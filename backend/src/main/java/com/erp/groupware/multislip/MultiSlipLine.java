package com.erp.groupware.multislip;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.HashMap;
import java.util.Map;

/**
 * 다목적 전표의 격자 한 줄. 열은 게시판마다 달라(MultiSlipBoard) 칸 값을 jsonb 하나에 둔다 —
 * 키는 화면의 열 정의(MultiSlipPage)가 정한다. 계산 칸(채권 · 월근태)은 서버가 다시 매겨 넣는다.
 */
@Entity
@Table(name = "multi_slip_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class MultiSlipLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "slip_id", nullable = false)
    private MultiSlip slip;

    @Column(name = "line_no", nullable = false)
    private int lineNo;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> fields = new HashMap<>();
}
