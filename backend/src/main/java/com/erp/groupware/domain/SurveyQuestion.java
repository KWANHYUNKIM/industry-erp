package com.erp.groupware.domain;

import com.erp.common.BaseTimeEntity;
import com.erp.groupware.domain.enums.SurveyQuestionType;
import jakarta.persistence.*;
import lombok.*;

import java.util.ArrayList;
import java.util.List;

/**
 * 설문 문항. 원본 설문조사입력의 질문 그리드 한 줄이다
 * (질문유형 · 질문내용 · 보기항목1~5 · 필수항목).
 *
 * <p>보기항목을 5칸 고정으로 두는 것은 원본이 그렇기 때문이다. 별도 테이블로 빼면
 * 화면과 저장 구조가 어긋나고, 보기 순서를 다루는 코드만 늘어난다.
 */
@Entity
@Table(name = "survey_questions")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SurveyQuestion extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "survey_id", nullable = false)
    private Survey survey;

    /** 1부터. 화면에 보이는 줄 번호. */
    @Column(nullable = false)
    private int seq;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private SurveyQuestionType type;

    @Column(nullable = false, length = 500)
    private String content;

    @Column(length = 200) private String option1;
    @Column(length = 200) private String option2;
    @Column(length = 200) private String option3;
    @Column(length = 200) private String option4;
    @Column(length = 200) private String option5;

    @Column(nullable = false)
    @Builder.Default
    private boolean required = false;

    @OneToMany(mappedBy = "question", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<SurveyAnswer> answers = new ArrayList<>();

    /** 빈 칸을 뺀 보기 목록. 화면·집계가 같은 규칙을 쓰도록 여기서 한 번만 정한다. */
    public List<String> options() {
        List<String> list = new ArrayList<>();
        for (String o : new String[]{option1, option2, option3, option4, option5}) {
            if (o != null && !o.isBlank()) list.add(o);
        }
        return list;
    }
}
