package com.erp.groupware.domain;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 문항 하나에 대한 답.
 *
 * <p>값은 문자열 하나로 둔다. 복수 선택·순위입력은 보기 텍스트를 개행으로 이어 붙인다 —
 * 유형마다 테이블을 나누면 집계 코드가 유형 수만큼 늘어난다. 개행을 쓰는 이유는
 * 보기 텍스트에 콤마가 들어가도 안전하기 때문이다.
 */
@Entity
@Table(name = "survey_answers")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SurveyAnswer extends BaseTimeEntity {

    /** 복수 값 구분자. 보기 텍스트에 들어갈 수 없는 문자를 골랐다. */
    public static final String VALUE_SEPARATOR = "\n";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "response_id", nullable = false)
    private SurveyResponse response;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "question_id", nullable = false)
    private SurveyQuestion question;

    @Column(columnDefinition = "text")
    private String value;

    /** 저장된 값을 보기 목록으로 편다. 단일 값이면 원소 1개. */
    public java.util.List<String> values() {
        if (value == null || value.isBlank()) return java.util.List.of();
        return java.util.Arrays.stream(value.split(VALUE_SEPARATOR))
                .map(String::trim).filter(s -> !s.isEmpty()).toList();
    }
}
