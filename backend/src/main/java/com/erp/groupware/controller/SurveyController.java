package com.erp.groupware.controller;

import com.erp.groupware.dto.SurveyDtos.CreateSurveyRequest;
import com.erp.groupware.dto.SurveyDtos.SubmitResponseRequest;
import com.erp.groupware.dto.SurveyDtos.SurveyResponseDto;
import com.erp.groupware.dto.SurveyDtos.SurveyResultDto;
import com.erp.groupware.dto.SurveyDtos.UpdateSurveyRequest;
import com.erp.groupware.service.SurveyService;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/surveys")
@RequiredArgsConstructor
public class SurveyController {

    private final SurveyService surveyService;

    @GetMapping
    public List<SurveyResponseDto> list(@AuthenticationPrincipal UserPrincipal principal) {
        return surveyService.findAll(principal.getUsername());
    }

    @GetMapping("/{id}")
    public SurveyResponseDto get(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        return surveyService.get(id, principal.getUsername());
    }

    @PostMapping
    public ResponseEntity<SurveyResponseDto> create(
            @Valid @RequestBody CreateSurveyRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(surveyService.create(req, principal.getUsername()));
    }

    @PatchMapping("/{id}")
    public SurveyResponseDto update(@PathVariable Long id, @Valid @RequestBody UpdateSurveyRequest req,
                                    @AuthenticationPrincipal UserPrincipal principal) {
        return surveyService.update(id, req, principal.getUsername());
    }

    /** 설문 응답. 예전에는 응답 수만 +1 했지만 이제 실제 답을 받는다. */
    @PostMapping("/{id}/respond")
    public SurveyResponseDto respond(@PathVariable Long id,
                                     @RequestBody(required = false) SubmitResponseRequest req,
                                     @AuthenticationPrincipal UserPrincipal principal) {
        return surveyService.submit(id, req, principal.getUsername());
    }

    /** 설문 결과 집계. 결과공개범위에 따라 403 이 날 수 있다. */
    @GetMapping("/{id}/result")
    public SurveyResultDto result(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        return surveyService.result(id, principal.getUsername());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        surveyService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
