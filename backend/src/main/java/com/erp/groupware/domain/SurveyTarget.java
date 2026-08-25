package com.erp.groupware.domain;

import com.erp.auth.domain.User;
import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/** 설문대상 한 사람. 원본 설문조사입력의 [설문대상] 코드도움으로 고른 사용자들. */
@Entity
@Table(name = "survey_targets",
        uniqueConstraints = @UniqueConstraint(name = "uk_survey_targets", columnNames = {"survey_id", "user_id"}))
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SurveyTarget extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "survey_id", nullable = false)
    private Survey survey;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;
}
