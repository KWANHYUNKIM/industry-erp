package com.erp.groupware.service;

import com.erp.common.ApiException;
import com.erp.groupware.domain.Survey;
import com.erp.groupware.domain.SurveyStatus;
import com.erp.groupware.dto.SurveyDtos.CreateSurveyRequest;
import com.erp.groupware.dto.SurveyDtos.SurveyResponse;
import com.erp.groupware.dto.SurveyDtos.UpdateSurveyRequest;
import com.erp.groupware.repository.SurveyRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import com.erp.groupware.dto.SurveyDtos;

@Service
@RequiredArgsConstructor
public class SurveyService {

    private final SurveyRepository surveyRepository;

    @Transactional(readOnly = true)
    public List<SurveyResponse> findAll() {
        return surveyRepository.findAll(Sort.by(Sort.Direction.DESC, "id")).stream()
                .map(SurveyResponse::from)
                .toList();
    }

    @Transactional
    public SurveyResponse create(CreateSurveyRequest req, String username) {
        Survey s = Survey.builder()
                .title(req.title())
                .startDate(req.startDate())
                .endDate(req.endDate())
                .target(req.target() != null ? req.target() : 0)
                .responses(0)
                .status(SurveyStatus.OPEN)
                .createdBy(username)
                .build();
        return SurveyResponse.from(surveyRepository.save(s));
    }

    @Transactional
    public SurveyResponse update(Long id, UpdateSurveyRequest req) {
        Survey s = get(id);
        if (req.title() != null) s.setTitle(req.title());
        if (req.startDate() != null) s.setStartDate(req.startDate());
        if (req.endDate() != null) s.setEndDate(req.endDate());
        if (req.target() != null) s.setTarget(req.target());
        if (req.status() != null) s.setStatus(req.status());
        return SurveyResponse.from(s);
    }

    /** 응답 1건 반영(응답수 +1). 마감된 설문은 응답 불가. */
    @Transactional
    public SurveyResponse respond(Long id) {
        Survey s = get(id);
        if (s.getStatus() == SurveyStatus.CLOSED) {
            throw ApiException.badRequest("마감된 설문에는 응답할 수 없습니다.");
        }
        s.setResponses(s.getResponses() + 1);
        return SurveyResponse.from(s);
    }

    @Transactional
    public void delete(Long id) {
        surveyRepository.delete(get(id));
    }

    private Survey get(Long id) {
        return surveyRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("설문을 찾을 수 없습니다. id=" + id));
    }
}
